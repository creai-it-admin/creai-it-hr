# 채용 수집기 구현·검증 기록

검증일: 2026-09-26. Node 24.14.0, Playwright 1.63.0, 로컬 macOS. 스케줄러와 LLM 실행은 범위에서 제외했다.

## 구현 범위

`server/ingestion/`의 공통 discover/refresh → 플랫폼 어댑터 → 검증된 부분 스냅샷 → 이전 값 비교 → 공고·revision·분석 대기 작업 저장 흐름을 `scripts/ingest.ts`에서 실행한다. 플랫폼별 DOM 코드는 `sources/` 안에, 영속 스키마는 `db/migrations/001_ingestion.sql`에 있다.

목록에서 처음 발견한 ID는 즉시 저장하고 상세 작업 상한에 걸리더라도 버리지 않는다. 기존 공고는 목록 조건 변화 또는 재확인 기한에 따라 조회한다. 실제 본문 비교는 LLM 없이 결정적으로 수행한다. 목록 누락·접근 실패를 마감으로 바꾸지 않는다.

## 테스트 설계와 결과

**자동 테스트 42개 통과**, TypeScript 및 ESLint 통과. 테스트에는 실제 파서와 실제 SQLite를 사용하고, 외부 사이트의 변경·장애만 통제된 입력으로 재현한다. 브라우저 테스트는 외부 사이트에 접속하지 않고 로컬 HTTP 서버에서 실행한다.

| 검증 대상 | 입력/재현 조건 | 확인한 결과 |
| --- | --- | --- |
| 소스별 파서 | 사람인 추가 공고 블록, 잡코리아 gno/gino, 인크루트 행/셀 구조 | 요청한 공고만 추출하고 잘못된 ID는 거부 |
| 신규 발견·반복 수집 | 페이지 중복, 겹치는 페이지, 다음 실행에 새 ID 추가 | 같은 원본은 1건, 새 ID만 추가 상세 조회 |
| 기존 공고 변경 | 업무 본문 수정, 공백만 변경, 이미지 URL의 바이트 변경 | 실질 변경만 revision·분석 대기 입력 추가 |
| 기간·상태 | 마감일 연장, 명시적 마감, 재오픈, 날짜만 있는 기한 | 기간/상태 revision만 추가; 분석 작업은 중복 등록하지 않음 |
| 오분류 방지 | 접수마감일 레이블, 추천 공고의 마감 문구, 이미지 추적 픽셀 | 정상 공고를 마감으로 바꾸거나 픽셀을 본문으로 인정하지 않음 |
| 실패·부분 추출 | iframe 누락, 429/503, 빈 목록, 이미지 실패·상한 | 기존 값 유지, 재확인 대상으로 보존, partial/failed 기록 |
| 저장 일관성 | 늦은 과거 응답, 분석 작업 INSERT 실패 | 최신 값 보존; 공고와 revision도 같은 트랜잭션에서 rollback |
| HTTP | EUC-KR 실제 바이트, 일시적 503, 다른 도메인 리다이렉트 | 올바른 디코딩·제한 재시도·허용 범위 밖 요청 거부 |
| 브라우저 | 부가 스크립트 무한 대기, 늦은 이벤트 초기화, 같은 정렬 재선택 | 필요한 DOM만 읽고, 정렬 이벤트 준비 후 실행 |
| CLI | 알 수 없는 소스·음수 예산 | 브라우저/DB 실행 전에 오류 종료 |

실행 명령: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## 실제 사이트 검증

다음 결과는 fixture가 아닌 공개 사이트의 실제 응답이다. 각 기본 목록의 **2페이지, 상세 최대 2건**으로 한정했다.

| 플랫폼 | 탐색 범위 | 발견한 고유 ID | 처음 읽은 상세 |
| --- | --- | ---: | ---: |
| 사람인 | 공채 신입, 수정순 | 40 | 2 |
| 잡코리아 | 신입·인턴, 최신 업데이트순 | 40 | 2 |
| 인크루트 | 오늘 등록·수정 | 120 | 2 |
| 합계 | 범위별 2페이지 | **200** | **6** |

- 같은 DB에서 목록을 다시 읽었을 때 200건으로 유지됐다. 194건은 발견만 하고 상세 처리를 기다리는 상태다.
- 저장된 상세 2건씩 강제 재확인했다. 잡코리아·인크루트는 각각 `unchanged=2`, `failed=0`이었다. 사람인도 재확인에서 `unchanged=2`를 확인했다.
- 사람인 상세 한 건의 이미지가 11개여서 초기 8개 상한 실행은 partial이었다. 상한을 16개로 조정한 뒤 누락된 이미지 3개 해시를 보충했고, 이 보충은 `bodyAssets`만 바뀐 revision 1건으로 기록됐다. 6건의 본문·이미지 추적 상태는 모두 `ok`로 확인했다. 이미지 내용 OCR을 했다는 뜻은 아니다.
- 인턴 전용 경로도 별도 DB로 확인했다. 사람인 2페이지 40건/상세 1건, 인크루트 2페이지 120건/상세 1건을 읽었다. 인크루트의 실제 이미지 CDN `c.incru.it`을 반영한 재확인은 complete였다.
- 인크루트 일반 마감 공고 `2608310000749`와 제휴 마감 공고 `2507090000503`을 실제로 읽고 둘 다 `closed`임을 assertion으로 검증했다.

목록 실행의 `partial`/종료 코드 2는 위의 의도적인 페이지·상세 상한 때문이다. 전체 플랫폼 수집 완료를 뜻하지 않는다. 원본 사이트의 실제 조건 수정·재오픈을 기다려 관측한 것은 아니며, 그러한 상태 전이는 자동 테스트에서 명시적으로 재현했다.

### 라이브 확인 중 수정한 문제

1. **사람인 연결:** 이 환경의 Chromium에서는 연결 reset/timeout이 발생했다. 표준 WebKit에서는 정상 응답을 확인해 사람인 클라이언트를 WebKit으로 지정했다. 사용자 브라우저 프로필·로그인·우회 옵션은 사용하지 않았다.
2. **렌더링과 이벤트 준비 시점 차이:** 정적 목록이 보여도 정렬 change 핸들러가 준비되기 전일 수 있었다. 정렬·탭 변경 전 DOMContentLoaded를 기다리고, 정렬이 이미 선택돼 있으면 재변경하지 않는다. 페이지 이동은 실제 행 ID 변화까지 확인한다.
3. **잡코리아 HTTP 목록:** 이전 조사 문서의 '첫 페이지 HTTP만으로 가능' 관측은 이번 응답에서는 재현되지 않았다. 따라서 목록·페이지 이동은 Chromium 경로로 구현했다.
4. **이미지 추적:** 실제 인크루트 CDN을 추가하고, 부분 이미지 읽기 실패가 이전 해시를 지우지 않도록 했다. 해시 객체의 순서만 달라도 변경으로 잡히던 문제는 회귀 테스트로 수정했다.

### 재현 명령과 로컬 증거

```bash
npm run ingest -- --source all --max-pages 2 --max-details 2 --db .data/verification-final.sqlite --report artifacts/ingestion-final-first.json
npm run ingest -- --source all --max-pages 2 --max-details 0 --db .data/verification-final.sqlite --report artifacts/ingestion-final-repeat.json
npm run ingest -- --source saramin --max-pages 2 --max-details 0 --db .data/verification-final.sqlite --report artifacts/ingestion-saramin-repeat-fixed.json
npm run ingest -- --source saramin --mode refresh --ids 55102083,55102304 --max-details 2 --db .data/verification-final.sqlite --report artifacts/refresh-saramin-stable.json
npm run ingest -- --source jobkorea --mode refresh --ids 49959653,50049571 --max-details 2 --db .data/verification-final.sqlite --report artifacts/refresh-jobkorea.json
npm run ingest -- --source incruit --mode refresh --ids 2609190000217,2609260000103 --max-details 2 --db .data/verification-final.sqlite --report artifacts/refresh-incruit.json
```

`artifacts/ingestion-final-repeat.json`에는 수정 전 사람인 정렬 실패도 그대로 남아 있다. 이후 사람인 재실행 증거는 `ingestion-saramin-repeat-fixed.json`이다. 원시 DB·실행 리포트는 로컬에만 저장하고 Git에서 제외한다. 공개 목록이 움직이므로 다른 시점의 ID·개수는 달라질 수 있다.

## 확인 범위의 한계

- 전체 공고 전수·장기간 무중단·모든 상세 템플릿을 검증한 것은 아니다. DOM 변경·차단은 실패로 드러나며 기존 레코드는 보존된다.
- 같은 URL의 이미지 바이트 변화도 추적하지만 OCR·첨부 PDF·기업 외부 지원 페이지의 내용까지 분석하지 않는다. 허용 CDN 밖의 이미지와 예산 초과는 partial이다.
- 중복 제거는 **소스별 원본 ID** 기준이다. 플랫폼 간 같은 채용 기회의 의미적 통합은 미구현이다.
- SQLite는 단일 호스트의 수동 수집 저장소다. `next_check_at`은 재확인 후보 선정용이며, 이를 자동 실행하는 스케줄러는 만들지 않았다.
