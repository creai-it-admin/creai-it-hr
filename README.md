# CREAI_IT-HR

채용·인턴 기회를 모으고, 개인의 목표에 맞게 탐색하며, 외부 AI에서 지원 준비를 시작하도록 돕는 CREAI+IT의 무료 서비스입니다.

**운영 목적:** 최소한의 운영 비용으로 실질적인 사용자 가치를 제공하고, CREAI+IT 교육으로의 유입을 만듭니다. HR 자체의 유료화는 목표로 두지 않습니다.

- [제품 목적과 핵심 기능](docs/product-definition.md) — 사용자 문제, 대외적 가치, 내부 목표, 교육 연결, 무료·저비용 운영 원칙과 초기 범위
- [사용자 경험 설계안](docs/ux/experience-design.md) — 구직자 페르소나 4개, 사용자 여정, 화면·상태·인터랙션과 검토 기준
- [디자인팀 목업 제작 전달서](docs/ux/design-handoff.md) — 화면 목록, 합성 공고 데이터, 클릭 시연 5개와 제작 완료 기준
- [채용 수집·갱신·중복 통합 기획](docs/ingestion-plan.md) — 데이터 구조, 소스별 수집 계약, 증분 갱신, 마감 관리와 구현 순서
- [1차 세 사이트 DOM 심층 조사](docs/research/phase-1-dom-deep-dive-2026-09-26.md) — 사람인·잡코리아·인크루트의 목록·본문·필터·페이지 이동, HTTP 검증과 delta 설계
- [10개 채용 사이트 후보 조사](docs/research/job-sources-2026-09-25.md) — 초기 조사 이력; 나머지 7개 사이트는 구현 보류
- **1차 범위 확정:** 사람인·잡코리아·인크루트의 신규·수정·마감 수집 인프라를 먼저 완성합니다.
- 현재 상태: 세 플랫폼의 수동 수집 CLI, DOM 파서, 증분 비교, Neon PostgreSQL 저장 및 회귀 테스트를 구현했습니다. 스케줄러·LLM 실행·실데이터에 연결된 제품 UI는 아직 없습니다.
- UX 목업: `app/`에 [디자인팀 전달서](docs/ux/design-handoff.md)의 합성 공고(F01–F12)와 시연 D1–D5로 동작하는 클릭 가능한 목업이 있습니다. 합성 데이터와 규칙 기반 도우미는 `app/_demo/`에 있으며 DB·수집·LLM을 호출하지 않습니다.

## 코드베이스 구조

**합의한 구현 구조:** 하나의 저장소 안에서 화면, 기능별 서버 로직, 실행 진입점을 분리합니다. 아래 트리에서 `ingestion`, `db`, `scripts/ingest.ts`와 `analysis/repository.ts`는 구현됐습니다. 분석 저장소 외 모델 실행 코드와 `scripts/analyze.ts`는 아직 구현하지 않았습니다.

```text
creaiit-hr/
├── app/                         # Next.js 화면·API 진입점
├── server/
│   ├── ingestion/               # 공통 수집·갱신 흐름
│   │   ├── contracts.ts         # 어댑터의 공통 입력·출력 타입
│   │   ├── discover.ts          # 신규 공고 탐색
│   │   ├── refresh.ts           # 기존 공고 재확인
│   │   ├── diff.ts              # 내용·기간·상태 변경 비교
│   │   ├── repository.ts        # 공고·변경 이력·실행 상태 저장
│   │   └── sources/
│   │       ├── registry.ts      # 수집할 플랫폼 등록
│   │       ├── saramin/         # incruit/와 동일한 책임 구분
│   │       ├── jobkorea/        # incruit/와 동일한 책임 구분
│   │       └── incruit/
│   │           ├── adapter.ts   # 목록 탐색·상세 읽기 인터페이스
│   │           ├── client.ts    # 요청·인코딩·페이지 이동
│   │           ├── parse.ts     # HTML/API → 공통 공고 형식
│   │           ├── parse.test.ts
│   │           └── fixtures/    # 파서 검증용 최소 HTML/API 표본
│   ├── analysis/                # 신규·변경 공고의 LLM 분석
│   │   ├── analyze.ts
│   │   ├── prompt.ts
│   │   ├── schema.ts            # 분석 결과 구조·검증
│   │   └── repository.ts        # 분석 작업·결과 저장
│   └── db/
│       └── client.ts            # DB 연결
├── scripts/
│   ├── ingest.ts                # 플랫폼·모드를 받아 수집 실행
│   └── analyze.ts               # 대기 중인 분석 작업 실행
├── db/
│   └── migrations/              # DB 구조 변경 이력
└── docs/                        # 제품·수집 설계와 조사 근거
```

### 책임과 데이터 흐름

- **플랫폼 어댑터:** 사이트별 요청·DOM·API 해석만 담당합니다. 공통 공고 형식과 함께 수집 범위, 완료/부분 실패 여부, 필드별 추출 상태를 반환합니다. DB 저장이나 LLM 호출을 직접 수행하지 않습니다.
- **공통 수집 모듈:** 신규·재확인 대상 선정, 변경 비교, 중복 저장 방지, 상태 갱신과 실행 이력을 담당합니다. 플랫폼별 선택자나 요청 주소를 이곳에 섞지 않습니다.
- **LLM 분석 모듈(미구현):** 저장된 공고 중 신규 또는 분석할 내용이 변경된 공고를 처리하도록 예정되어 있습니다. 현재 수집기는 분석 대기 작업과 그 시점의 입력만 등록합니다. 마감일·노출 순위 변경만으로 LLM을 다시 호출하지 않습니다. 분석 오류는 수집과 분리해 재시도합니다.
- **실행 진입점:** `scripts/`는 옵션을 읽고 서버 모듈을 호출합니다. 실제 수집 로직은 `server/ingestion/`에 두어 로컬 실행과 정기 작업이 재사용합니다. 웹 요청에서 긴 수집 작업을 직접 실행하지 않습니다.

```text
목록 탐색 / 기존 공고 재확인
  → 플랫폼 어댑터 → 공통 형식 → 이전 값과 비교
  → 공고·변경 이력 저장 + 필요 시 분석 작업 등록 (동일 DB 트랜잭션)
  → 별도 실행에서 LLM 분석 → 결과 저장
```

새 플랫폼은 `sources/<platform>/`에 어댑터·표본 테스트를 추가하고 `registry.ts`에 등록합니다. 개인화 탐색·준비 프롬프트처럼 새로운 기능은 실제 구현 시 `server/matching/`, `server/preparation/` 등의 기능별 모듈로 추가합니다. DB 연결은 `server/db/`, 스키마 변경 이력은 최상단 `db/migrations/`에 둡니다. DB·수집·분석 모듈은 서버 실행 경로에서만 사용합니다.

에이전트의 코드 배치·변경 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다. 수집 계약과 미확인 조건은 [수집 기획](docs/ingestion-plan.md) 및 [DOM 심층 조사](docs/research/phase-1-dom-deep-dive-2026-09-26.md)를 확인합니다.

## 수집기 실행

Node **24 이상**과 아래 브라우저 런타임을 사용합니다. 기존 로그인 프로필이나 API 키는 사용하지 않습니다.

```bash
npm ci
npx playwright install chromium webkit

# .env.local에 DATABASE_URL을 설정한 뒤 스키마 적용 (마이그레이션 명령만 DDL 실행)
npm run db:migrate

# 신규 탐색: 소스별 목록 2페이지, 상세 최대 10건
npm run ingest -- --source all --max-pages 2 --max-details 10

# 발견 후 미처리된 공고와 재확인 기한이 된 공고를 읽기
npm run ingest -- --source all --mode refresh --max-details 10

# 저장된 특정 공고를 즉시 재확인
npm run ingest -- --source saramin --mode refresh --ids 55102083 --max-details 1

# 인턴 목록은 별도 범위로 실행
npm run ingest -- --source saramin --scope intern --max-pages 2 --max-details 2
npm run ingest -- --source incruit --scope intern --max-pages 2 --max-details 2
```

저장 대상은 `.env.local`의 `DATABASE_URL`에 지정한 Neon `hr` 스키마입니다. `--report artifacts/run.json`으로 실행 결과를 저장할 수 있습니다. `discover --max-details 0`은 발견한 ID만 저장합니다. `--ids`는 DB에 이미 있는 공고의 재확인용입니다. 실행 상한에 걸린 미처리 상세는 DB에 남아 다음 `refresh`에서 처리합니다.

| 소스 | 현재 탐색 범위 | 읽기 방식 |
| --- | --- | --- |
| 사람인 | 공채 신입 또는 인턴 목록, 수정순 | WebKit 렌더링 + 현재 공고의 iframe |
| 잡코리아 | 신입·인턴 테마 목록, 최신 업데이트순 | Chromium 렌더링 + iframe HTTP |
| 인크루트 | 오늘 등록·수정 또는 인턴 목록 | EUC-KR HTTP + iframe HTTP |

이 범위는 세 플랫폼 전체 공고의 전수 수집을 의미하지 않습니다. 목록은 매번 앞에서부터 정해진 페이지 수만큼 탐색하며, 알려진 ID가 나와도 뒤에 새 공고가 있을 수 있어 조기 종료하지 않습니다. 목록에서 사라진 공고도 기존 DB의 재확인 대상으로 유지합니다.

**저장과 변경 판정**

- `(source, tenant_key, source_id)`가 원본 식별자입니다. 같은 원본은 한 건만 저장하며, 서로 다른 플랫폼의 유사 공고를 임의로 합치지 않습니다.
- 업무·조건·본문·이미지 바이트 변경은 revision과 분석 대기 작업을 만듭니다. 기간·명시적 마감 상태만 바뀌면 revision만 만듭니다.
- 본문 실패·429·잘못된 ID·파서 오류는 실패/부분 상태와 재시도 시각으로 남습니다. 읽지 못한 값으로 유효한 본문을 비우거나 공고를 마감시키지 않습니다.
- 날짜 경과(`deadline_elapsed`)와 사이트가 명시한 마감(`closed`)을 구분합니다. 날짜만 있는 마감은 한국 시간의 해당 날짜 끝까지로 해석합니다.
- 텍스트·이미지·혼합·본문 미확보를 구분합니다. 이미지는 URL과 바이트 해시를 추적하며 **OCR은 실행하지 않습니다**. 공고당 이미지 최대 16개, 개당 5MB를 확인합니다. 초과/실패는 `partial`이고 기존 해시를 보존합니다.

**실행 결과:** 종료 코드 `0` = 요청 범위 완료, `2` = 부분 완료(페이지·상세 상한 포함), `1` = 목록 수집 실패 또는 잘못된 옵션. 각 보고서의 `errors`, `next`와 DB의 `fetch_state`를 함께 확인합니다. `created`는 상세를 처음 저장한 수이고 `discovered`는 해당 실행에서 발견한 고유 ID 수입니다.

HTTP 요청과 브라우저 페이지 작업에는 기본 2초 간격을 둡니다. HTTP의 일시적 오류는 제한적으로 재시도하고, 차단·인증 요구를 우회하지 않습니다. 브라우저의 부가 스크립트 로딩 대신 실제 공고 DOM이 준비됐는지 확인합니다.

Neon PostgreSQL을 영속 저장소로 사용합니다. 4개 업무 테이블은 최신 공고·변경 이력·분석 작업·수집 실행을 각각 담당합니다. 목록은 페이지 단위 일괄 UPSERT이며, 동일한 상세는 본문과 이력을 다시 쓰지 않습니다. 공고 변경·revision·분석 대기 등록은 한 트랜잭션입니다. 임대 토큰과 만료 시각으로 여러 실행의 중복 처리와 오래된 작업자의 쓰기를 막습니다. 외부 수집·분석 중 DB 트랜잭션은 열어 두지 않습니다.

상세 작업 임대는 30분, 분석 작업은 15분입니다. 분석은 실패 시 지수 백오프로 재시도하며 5회 시도 후 `failed`로 남습니다. `server/analysis/repository.ts`는 임대·완료·실패 저장만 제공하고 모델은 호출하지 않습니다. 작업 입력은 특정 불변 revision을 참조합니다. 다른 분석기로 다시 분석할 때는 `analyzer_version`을 다르게 등록합니다. 최신 결과를 사용할 때는 공고의 현재 `content_hash`와 작업의 해시를 대조해야 합니다.

기존 SQLite 데이터의 일회성 이전은 아래 명령으로 실행합니다. 파일을 모두 함께 지정해야 중복 공고의 이력을 합칠 수 있습니다. 원본은 읽기 전용이며, 전체 이전은 원자적으로 커밋됩니다. 동일한 입력의 재실행은 아무것도 쓰지 않습니다. 다른 입력과 기존 Neon 공고가 충돌하면 덮어쓰지 않고 중단합니다.

```bash
npm run db:import-sqlite -- .data/file-a.sqlite .data/file-b.sqlite
```

운영 런타임은 SQLite에 쓰지 않습니다. `db/legacy/001_sqlite.sql`은 이전 포맷 검증용이고, 변경할 스키마는 새 SQL 파일을 `db/migrations/`에 추가합니다. 적용된 파일의 checksum이 달라지면 적용을 거부합니다. `.env*`, `.data/`, `artifacts/`는 Git에서 제외됩니다.

## 검증

### DB 비용과 정리

목록은 동일 관측의 재전송이면 쓰기를 생략하고 상세 확인 후보만 반환합니다. **새 시각의 재관측은 정확한 last_seen 기록을 위해 갱신**합니다. 임대한 상세 저장은 현재 상태·revision·분석 등록을 하나의 SQL로 쓰며, 실패 기록은 단일 UPDATE입니다. 분석 claim은 인덱스 순서로 최대 20건을 선택하고 만료 작업 정리도 요청 건수 이내로 제한합니다.

오래된 수집 실행 보고서는 명시적으로 정리할 수 있습니다. 기본은 미리보기이며, `--execute`는 한 배치만 삭제하고 종료합니다. `--limit`는 1–1,000입니다. 공고·revision·분석 결과와 실행 중인 보고서는 삭제하지 않습니다. 보존 기간은 운영자가 `--before`로 정합니다.

```bash
npm run db:prune-runs -- --before 2026-01-01T00:00:00Z --limit 500
# 위 대상의 실제 삭제가 필요할 때만 --execute 추가
npm run db:prune-runs -- --before 2026-01-01T00:00:00Z --limit 500 --execute
```

CLI는 실행을 마치면 연결 풀을 닫습니다. 풀은 프로세스당 최대 4개 연결이며 keep-alive 쿼리나 상시 대기열 polling은 없습니다. 여러 프로세스를 실행하면 연결 수도 그만큼 늘어납니다. Neon의 실제 요금제·compute 상한·scale-to-zero 설정은 별도 계정 설정이며 이 코드가 변경하지 않습니다. 향후 스케줄링은 유휴 DB를 자주 깨우는 polling 대신 유한한 배치 실행을 사용합니다.

측정 조건·변경 전후 자원량은 [DB 최적화 검증](docs/db-optimization-2026-09-26.md)에 기록합니다. `npm run db:audit-resources`는 실제 Neon의 독립 스키마에 1만 건을 만들어 실행계획·전송량을 측정하므로 DB 리소스를 사용합니다.

### 명령

```bash
npm test                    # 외부 DB 없는 파서·HTTP·브라우저 단위 테스트
npm run test:db             # 실제 Neon의 독립 테스트 스키마; 완료 후 삭제
npm run typecheck
npm run lint
npm run build
```

[Neon 검증 기록](docs/neon-verification-2026-09-26.md)에 이전 데이터 대조·동시성·1만 건 마이크로 테스트·실제 사이트 실행 결과를 구분했습니다. `npm test`는 외부 사이트/DB에 접속하지 않습니다. `test:db`는 DATABASE_URL에 접속하여 무작위 `hr_test_*` 스키마만 만들고 제거합니다. 이전 SQLite 기반 수집 검증은 [기존 기록](docs/ingestion-verification-2026-09-26.md)에 보존했습니다.

Next.js 개발 서버는 `npm run dev -- --port 3011`로 실행할 수 있습니다. 현재 수집 CLI는 이 웹 서버와 독립적으로 동작합니다.
