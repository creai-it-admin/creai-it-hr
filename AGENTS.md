# CREAI_IT-HR — 코드베이스 작업 규칙

이 파일은 `creaiit-hr/` 전체에 적용한다. 제품은 무료이며 최소 운영 비용으로 사용자에게 채용 탐색 가치를 제공하고 CREAI+IT 교육으로 연결한다. 1차 수집 대상은 **사람인·잡코리아·인크루트**다.

## 기준 문서와 구현 상태

- [README.md](README.md): 합의한 전체 폴더 트리와 책임 구분.
- [제품 정의](docs/product-definition.md): 사용자·가치·제품 범위.
- [수집 기획](docs/ingestion-plan.md): ID·갱신·저장·실패 처리 계약.
- [DOM 심층 조사](docs/research/phase-1-dom-deep-dive-2026-09-26.md): 사이트별 관측 근거와 미검증 조건.

README의 트리는 구현할 때 따르는 배치 기준이다. 파일이나 폴더가 문서에 있다는 이유로 기능이 구현됐다고 판단하지 않는다. 기능 구현에 필요한 시점에 파일을 추가하며, 빈 모듈·미사용 추상화·추가 플랫폼을 미리 만들지 않는다.

## 코드 배치

| 위치 | 책임 |
| --- | --- |
| `app/` | Next.js 화면·API 진입점. 서버 기능을 호출하되 수집 엔진을 포함하지 않음 |
| `server/ingestion/sources/<platform>/` | 플랫폼별 `adapter.ts`, `client.ts`, `parse.ts`, `parse.test.ts`, `fixtures/` |
| `server/ingestion/sources/registry.ts` | 사용할 플랫폼 등록 |
| `server/ingestion/contracts.ts` | 어댑터 공통 입력·출력, 수집 완료 여부·필드별 추출 상태 |
| `server/ingestion/discover.ts`, `refresh.ts` | 신규 탐색·기존 공고 재확인 흐름 |
| `server/ingestion/diff.ts` | 정규화한 내용·기간·상태의 deterministic 비교 |
| `server/ingestion/repository.ts` | 공고·변경 이력·실행 상태 저장 |
| `server/analysis/` | `analyze.ts`, `prompt.ts`, `schema.ts`, `repository.ts`: LLM 분석과 작업·결과 저장 |
| `server/db/client.ts` | 공통 DB 연결 |
| `db/migrations/` | DB 구조 변경 이력 |
| `scripts/ingest.ts`, `scripts/analyze.ts` | 옵션 해석과 서버 모듈 호출만 담당하는 실행 진입점 |
| `docs/` | 제품·설계 결정·소스 조사 근거 |

## 현재 저장소

- 운영 저장소는 Neon PostgreSQL의 `hr` 스키마, 연결은 `DATABASE_URL`이다. SQLite는 일회성 이전 입력으로만 사용한다.
- 최신 상태·불변 revision·분석 작업은 같은 트랜잭션으로 저장한다. 대기열에는 본문을 복제하지 않고 revision을 참조한다.
- 조회 인덱스와 작업 임대는 [Neon 설계](docs/neon-migration-plan.md)를 따른다. 적용된 SQL은 수정하지 않고 새 migration을 추가한다.
- `npm test`와 `npm run test:db`를 구분한다. 실제 DB 테스트는 독립 `hr_test_*` 스키마만 만들고 정리하며 `hr`를 비우지 않는다.

## 의존성과 변경 규칙

1. **플랫폼 코드는 수집·해석만 한다.** 요청·인코딩·페이지 이동은 `client.ts`, 문서 해석은 `parse.ts`, 목록 탐색·상세 읽기의 공통 인터페이스 구현은 `adapter.ts`에 둔다. DB나 LLM을 직접 호출하지 않는다.
2. **플랫폼 간 공통 판단은 수집 모듈에 둔다.** 사이트별 선택자는 해당 플랫폼 폴더에 한정한다. 어댑터는 공고뿐 아니라 수집 범위·완료/부분 실패 여부·필드별 추출 상태를 반환한다.
3. **수집과 분석을 분리한다.** 공고·변경 이력 저장과 필요한 분석 작업 등록은 같은 DB 트랜잭션으로 처리한다. LLM은 별도 실행에서 처리하고 독립적으로 재시도한다. 마감일 등 규칙으로 반영 가능한 변화만으로 분석을 다시 호출하지 않는다.
4. **공통 저장 계약을 유지한다.** `(source, tenant_key, source_id)`로 중복 저장을 막는다. 접근·파싱 실패를 마감으로 해석하거나 읽지 못한 값으로 기존 유효 값을 덮어쓰지 않는다. 늦게 끝난 과거 실행이 최신 값을 덮어쓰지 않도록 한다.
5. **웹·CLI가 같은 기능을 사용한다.** 업무 로직은 `server/`에 두고 `scripts/`에 복제하지 않는다. 긴 수집을 웹 요청 안에서 실행하지 않는다. 클라이언트 컴포넌트에서 DB·수집·분석 모듈을 import하지 않는다.
6. **변경한 파서를 실제 형태의 표본으로 검증한다.** 최소한의 비밀정보 없는 fixture와 테스트를 해당 플랫폼에 둔다. 요청 ID 일치, 추천 공고 혼입 방지, 본문 유형·마감 표시 차이, 부분 실패를 확인한다. 원시 수집 결과 전체를 Git에 축적하지 않는다.
7. **기능 단위로 확장한다.** 새 소스는 플랫폼 폴더와 registry에 추가한다. 개인화 탐색·준비 프롬프트 등은 실제 구현 시 `server/` 아래 별도 기능 모듈로 둔다. 공통 로직의 플랫폼별 복사본을 만들지 않는다.

아래 Next.js 관리 블록은 유지한다. 프로젝트 고유 규칙은 관리 블록 밖에서 수정한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
