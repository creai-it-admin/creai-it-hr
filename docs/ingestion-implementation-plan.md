# 세 플랫폼 수집 구현·검증 계획

> 초기 SQLite 구현 당시의 기록입니다. 현재 저장소와 검증 기준은 [Neon 전환 설계](neon-migration-plan.md)를 따릅니다.

기준: 2026-09-26. [설계](ingestion-plan.md)와 [DOM 조사](research/phase-1-dom-deep-dive-2026-09-26.md)를 구현한다.

## 범위

- 사람인·잡코리아·인크루트의 제한된 공개 목록 탐색, 상세 읽기, 기존 공고 재확인.
- 공통 TypeScript 파이프라인, Cheerio 파서, 필요한 경우 표준 Chromium/WebKit 렌더링, SQLite 영속 저장. 현재 Node 24에서 수동 CLI 실행.
- 공고·변경 이력·실행 상태·분석 대기 작업을 저장한다. 스케줄러와 LLM 실행, 추천 UI, 자동 지원은 만들지 않는다.
- 일반 HTTP와 렌더링 경로를 구분한다. 차단·CAPTCHA·접근 실패를 우회하거나 성공으로 감추지 않는다.

## 구현과 검증 순서

1. **소스 계약·파서** — `server/ingestion/contracts.ts`, `sources/{saramin,jobkorea,incruit}/{parse,parse.test}.ts`, `fixtures/`.
   - 입력: 목록 HTML과 URL, 상세 HTML/현재 공고 참조/현재 공고 iframe HTML.
   - 출력: ID가 검증된 목록 항목·다음 페이지·완료 여부, 필드별 부분 추출 결과.
   - 먼저 표본 테스트 작성·실패 확인: 다른 공고 혼입, gno/gino 불일치, EUC-KR, 마감 템플릿, 누락 iframe, 이미지 본문.
2. **저장·비교** — `server/db/client.ts`, `db/migrations/001_ingestion.sql`, `server/ingestion/{diff,repository}.ts`.
   - 실제 임시 SQLite DB로 신규 1건→동일 재수집→본문 수정→기간 연장→마감→재오픈을 확인한다.
   - 원본 키 중복 방지, 부분 실패의 기존 값 보존, 과거 응답 덮어쓰기 방지, 분석 작업의 원자적 등록을 검증한다.
3. **소스 클라이언트·공통 실행** — 플랫폼별 `client.ts`, `adapter.ts`, 공통 `discover.ts`, `refresh.ts`, `sources/registry.ts`, `scripts/ingest.ts`.
   - 실제 파서·DB를 유지하고 외부 응답만 통제해 다중 페이지·중복·실패·재시도·실행 예산을 검증한다.
   - 페이지 상한·상세 상한·반복 페이지·잘못된 HTML은 partial/failed로 기록한다. 목록 부재는 마감 근거가 아니다.
4. **실제 공개 사이트 확인** — 각 소스를 작은 예산으로 수집하고 같은 DB에서 재실행·refresh한다.
   - 라이브 결과와 fixture로 재현한 조건 변경을 분리해 보고한다. API 승인이 없거나 렌더링 실패한 소스는 실제 제한을 기록한다.
   - `npm test`, TypeScript 검사, lint, build, CLI 오류 종료 코드, 저장 데이터·변경 이력을 확인한다.

## 판정 기준

- 동일 ID 재발견으로 공고 수가 증가하지 않는다.
- 업무·요건 변경은 revision과 분석 대기 작업을 만들고, 마감일만 변경되면 revision만 만든다.
- 통계·D-day·노출 순위는 내용 변경으로 처리하지 않는다.
- 실패·빈 응답·불완전 본문으로 기존 공고가 삭제되거나 마감되지 않는다.
- 목록 일부만 순회한 실행은 완주로 표시하지 않는다. 다음 실행에서 미처리 상세를 재시도할 수 있다.
- 검증된 관측 범위와 본문 품질을 보존한다. 이미지의 내용을 추출하지 않았다면 전문 확보로 표시하지 않는다.

구체적인 입력 표본과 기대값은 함께 작성하는 테스트 파일이 실행 가능한 검증 명세다.

## 실행 결과

위 범위의 구현과 검증을 수행했다. 결과·재현 명령·검증 한계는 [검증 기록](ingestion-verification-2026-09-26.md)을 따른다.
