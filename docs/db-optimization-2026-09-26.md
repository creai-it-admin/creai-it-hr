# Neon DB 리소스 최적화 — 2026-09-26

수집·분석 저장소의 불필요한 UPDATE, 반환 데이터, DB 왕복과 대기열 전체 스캔을 줄였다. 원본 식별자, 관측 시각, 부분 응답 병합, 불변 revision, 원자적 저장, 임대 토큰에 의한 오래된 작업자 차단은 유지한다.

## 실제 Neon에서 비교한 결과

싱가포르 Neon의 독립 `hr_test_*` 스키마에 합성 공고 10,000건을 생성했다. 동일한 기준 데이터·500건 배치와 약 19KB 본문으로 변경 전후를 비교했다. 테스트 스키마는 종료 후 제거한다. 실제 사이트와 LLM은 호출하지 않았다.

| 측정 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 목록·관측 시각이 동일한 10,000건 재전송: 실제 UPDATE | 10,000행 | **0행** |
| 재확인 대상 0건인 위 목록의 반환 행 | 10,000행 | **0행** |
| 반환 JSON 크기, 20회 합계 | 1,396,702 bytes | **40 bytes** (`[]` 20회) |
| 동일 500건 재전송 SQL의 WAL | 417,210 bytes | **0 bytes** |
| claim → 동일 상세 저장, BEGIN/COMMIT 포함 | 6회 왕복 | **5회** |
| claim → 변경 상세 저장 | 8회 왕복 | **5회** |
| 위 변경 저장의 파라미터 JSON 크기 | 39,732 bytes | **19,806 bytes** |
| claim → 실패 기록 | 5회 왕복 | **2회** |
| 분석 대기 10,000건에서 5건 선택 시 후보 읽기 | 10,000행 + 정렬 | **인덱스에서 5행** |
| 분석 claim(1), 만료·시도 소진 작업 1,000건 존재 | 1,000행 실패 전환 | **1행 실패 전환** |

응답·파라미터 JSON 크기는 애플리케이션 직렬화 크기이며 WebSocket 패킷 전체 크기가 아니다. WAL은 `EXPLAIN(ANALYZE,BUFFERS,WAL)`로 측정했다. 동일 재전송의 무갱신은 `xmin`/`ctid` 전후 비교로도 확인했다.

분석 claim SQL의 실행 시간과 shared buffer hit는 다음과 같다. DB 내부 실행 시간이며 네트워크·모델 실행 시간은 제외한다.

| 대기 수 / 요청 5건 | 이전 실행 시간 | 이후 실행 시간 | 이전 / 이후 buffer hit |
|---:|---:|---:|---:|
| 10 | 0.395ms | 0.319ms | 118 / 116 |
| 1,000 | 0.875ms | 0.294ms | 136 / 116 |
| 10,000 | 5.326ms | 0.318ms | 456 / 116 |

반복 목록 500건 SQL은 10.279ms → 2.415ms였다. 다만 이번 로컬↔Neon 전체 경과 시간에는 큰 변동이 있었다. 예를 들어 변경 저장은 왕복이 줄었지만 817ms → 1,568ms로 측정됐다. **전체 응답속도나 실제 청구액이 같은 비율로 개선됐다는 증거로 사용하지 않는다.** 검증된 개선은 쓰기량·전송량·왕복 수·쿼리의 처리 범위다.

## 변경 내용과 유지되는 의미

- **목록:** 기존 행의 시각·해시·ref와 먼저 비교해 완전 동일하거나 오래된 관측은 UPSERT 입력에서 제외한다. 상세 확인 후보만 반환한다. 새로운 시각의 동일 공고는 `last_seen_in_list_at`을 정확하게 갱신한다. 이후 시각의 재관측 10,000건에서도 불필요한 응답은 0행이었다. 동시 INSERT가 SQL 스냅샷에 보이지 않는 경우에도 후보를 잃지 않도록 반환하며, 실제 처리 가능 여부는 원자적 claim이 다시 확인한다.
- **상세 저장:** claim한 공고의 중복 INSERT를 제거했다. 필요한 현재 상태만 읽어 부분 응답을 병합한 뒤, UPDATE → revision INSERT → 분석 작업 INSERT를 단일 SQL로 실행한다. 본문을 파라미터로 두 번 보내지 않는다. 전체 과정은 같은 트랜잭션이고 어느 단계든 실패하면 롤백한다.
- **실패:** claim이 있는 경로는 한 번의 토큰·시각 검증 UPDATE로 끝난다. 만료 작업자가 존재하지 않는 공고를 다시 생성하지 않는다.
- **분석 대기열:** 만료 작업과 pending을 각각 기존 인덱스 순서로 선택한다. 호출당 claim은 요청 수(최대 20) 이내, 만료 정리도 요청 수 이내다. 모든 대상은 `SKIP LOCKED`로 동시 실행을 조정한다. 최종 후보에도 명시적인 LIMIT를 유지해 UPDATE 실행계획이 전체 테이블 조인을 선택하지 않도록 했다. 잠긴 행·통계·데이터 분포에 따라 실제 물리적 읽기량은 달라질 수 있다.
- **삭제:** 운영용 정리는 완료·부분 완료·실패한 수집 실행 보고서에 한정한다. `002_run_retention.sql`이 날짜순 정리 인덱스를 추가한다. `db:prune-runs`는 명시적 cutoff, 기본 미리보기, 최대 1,000건 단일 배치로 동작한다. 공고·revision·분석 결과를 임의로 지우지 않는다.

## Neon 비용에 대한 적용 범위

Neon은 유료 플랜에서 compute의 CU-hour, 저장 용량, 포함량을 초과하는 전송량 등을 과금한다. CU-hour는 compute 크기와 활성 시간의 곱이다. SQL 작업량이 줄었다고 compute 활성 시간이 반드시 같은 비율로 줄어드는 것은 아니다. [공식 가격표](https://neon.com/pricing).

앱은 최대 4개 연결의 풀을 사용하고 유휴 연결을 10초 후 반환하며 CLI 종료 시 풀을 닫는다. 별도 keep-alive 쿼리·상시 polling·스케줄러를 추가하지 않았다. 짧은 주기의 빈 조회가 DB를 계속 깨우는 방식보다 필요한 작업을 유한한 배치로 처리하고 종료하는 운영이 비용 목표에 맞는다.

Neon의 scale-to-zero는 비활성 compute를 중지해 compute 사용료를 줄이고, autoscaling의 최대 CU는 compute 확장 상한을 설정한다. **현재 계정의 요금제, CU 범위, scale-to-zero 활성 여부와 실제 청구 내역은 관리 API/콘솔로 검증하지 못했으며 변경하지 않았다.** [Scale to Zero](https://neon.com/docs/introduction/scale-to-zero), [Autoscaling](https://neon.com/docs/introduction/autoscaling).

기본 autovacuum을 유지했다. DELETE 이후 공간은 재사용될 수 있지만 파일·저장료가 즉시 같은 양만큼 줄어드는 것으로 가정하지 않는다. 근거 없이 인덱스·fillfactor를 늘리거나 VACUUM FULL을 실행하지 않았다. [PostgreSQL VACUUM](https://www.postgresql.org/docs/current/routine-vacuuming.html).

## 검증과 재현

- 단위 테스트 27개, 실제 Neon DB 테스트 25개 통과. 세 플랫폼의 parser → 발견 → 저장 → 갱신 → 실패 보존 흐름, 동시 claim, 과거 응답 차단, 부분 병합, 저장 실패 롤백, SQLite 이전 재실행을 포함한다.
- 타입 검사·ESLint·Next.js production build 통과.
- 신규 자원 회귀 테스트는 최적화 전 네 가지 결함을 실제 Neon에서 재현해 실패한 뒤, 변경 후 통과했다.
- 실행 보고서 정리는 기본 미리보기, 최대 처리량, cutoff, 실행 중·최근 보고서 보존을 검증했다. 실제 공고 이력의 삭제는 실행하지 않았다.
- 현재 운영 `hr` 스키마에 `002_run_retention.sql` 적용과 인덱스 생성을 확인했다. 실제 CLI 미리보기 결과는 삭제 0건이었다.
- 적용 전후 네 업무 테이블의 전체 행 내용 fingerprint가 일치했다. **공고 398건, revision 14건, 분석 작업 14건, 실행 보고서 19건을 그대로 보존**했다. 테스트 스키마 잔여 0개를 확인했다. 근거는 `artifacts/neon-optimization-before.json`, `artifacts/neon-optimization-after.json`이다.

```bash
npm test
npm run test:db
npm run typecheck
npm run lint
npm run build
npm run db:audit-resources
```

로컬 측정 증거는 Git에서 제외된 `artifacts/neon-resource-baseline.json`(변경 전), `artifacts/neon-resource-audit.json`(변경 후)에 보관한다. 테스트는 현재 `DATABASE_URL`의 Neon 리소스를 사용하며 독립 스키마만 삭제한다. 1만 건 합성 데이터 검증이므로 수백만 건·실제 장기 트래픽에서 동일한 절대 수치를 보장하지 않는다.
