"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWorld } from "../_demo/store";
import { stamp } from "../_demo/format";

/** 원문 이동의 목업 목적지. 실제 채용 사이트에 접속하거나 정보를 보내지 않는다. */
export function OriginalFrame({ refId }: { refId: string }) {
  const { postings } = useWorld();
  const posting = postings.find((p) => p.sources.some((s) => s.ref === refId));
  const source = posting?.sources.find((s) => s.ref === refId);
  return (
    <div className="frame">
      <p className="frame-note">
        <b>원문 예시 · 샘플</b> 실제 채용 사이트가 아니에요. 제품에서는 여기서{" "}
        {source?.name ?? "원문"} 공고가 새 탭으로 열려요.
      </p>
      {posting && source ? (
        <article className="frame-page">
          <p className="frame-site">{source.name} (예시)</p>
          <h1>{posting.title}</h1>
          <p className="muted">
            {posting.company} · 예시 주소 {source.url}
          </p>
          {posting.body ? (
            posting.body.map((b) => <p key={b.id}>{b.text}</p>)
          ) : (
            <p className="muted">
              이 목업에는 원문 본문을 넣지 않았어요 (F12: 본문 미확보 시나리오).
            </p>
          )}
          <p className="frame-foot">
            마지막 본문 확인 {stamp(source.verifiedAt)} · 이 화면의 지원 버튼은
            없어요. 지원은 원문 사이트에서 직접 진행해요.
          </p>
        </article>
      ) : (
        <p>이 예시 원문을 찾을 수 없어요.</p>
      )}
      <p className="frame-back">
        이 탭을 닫으면 보던 화면이 그대로 남아 있어요.
      </p>
    </div>
  );
}

/** 교육·소개 링크의 목업 목적지. HR에서 온 경로와 노출 위치만 전달된다는 계약을 보여준다. */
export function EducationFrame() {
  const params = useSearchParams();
  const placement = params.get("placement") ?? "unknown";
  const nav = placement === "nav";
  return (
    <div className="frame">
      <p className="frame-note">
        <b>목업 목적지</b> 제품에서는 여기서{" "}
        {nav
          ? "CREAI+IT 소개 페이지"
          : "CREAI+IT Foundation Education 설명 페이지"}
        가 새 탭으로 열려요.
      </p>
      <article className="frame-page">
        <p className="frame-site">CREAI+IT</p>
        <h1>{nav ? "CREAI+IT 소개" : "Foundation Education"}</h1>
        <p>
          {nav
            ? "LEARN · GROW · CONNECT — HR은 역량이 기회를 만나도록 돕는 CONNECT를 맡아요."
            : "큰 업무를 AI와 함께 수행하는 기반을 배우는 교육이에요."}
        </p>
        <dl className="frame-passed">
          <div>
            <dt>함께 전달된 정보</dt>
            <dd>from=hr · placement={placement}</dd>
          </div>
          <div>
            <dt>전달하지 않은 정보</dt>
            <dd>경험 서술, 희망 연봉, 탐색 조건, 대화 내용, 저장한 공고</dd>
          </div>
        </dl>
        <p className="muted">
          자동 신청이나 연락처 수집은 없어요. 교육을 보지 않아도 HR의 탐색·준비
          기능은 그대로 무료예요.
        </p>
      </article>
      <Link href="/" className="text-btn strong">
        HR로 돌아가기
      </Link>
    </div>
  );
}
