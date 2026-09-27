"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { findPosting, payConflict } from "../_demo/fixtures";
import { day } from "../_demo/format";
import {
  evaluate,
  hasCriteria,
  hasExperience,
  type Evaluation,
} from "../_demo/match";
import {
  openPrepareOn,
  setOrigin,
  toggleCompare,
  useHydrated,
  useWorld,
} from "../_demo/store";
import { ArrowLeft, Close } from "./icons";
import { StatusBadge, VerdictMark } from "./marks";

const missing = <span className="is-empty">공고에 없음</span>;

const ROWS: {
  label: string;
  render: (r: Evaluation, personal: boolean) => ReactNode;
}[] = [
  {
    label: "실제 업무",
    render: (r) =>
      r.posting.tasks.length
        ? r.posting.tasks.map((t) => t.text).join(" · ")
        : missing,
  },
  {
    label: "경력·필수 요건",
    render: (r) => (
      <>
        <span>{r.posting.career?.text ?? "경력 조건 공고에 없음"}</span>
        {r.posting.required.map((q) => (
          <span key={q.label} className="req">
            필수 · {q.label}
          </span>
        ))}
        {r.posting.preferred.map((q) => (
          <span key={q.label} className="pref">
            우대 · {q.label}
          </span>
        ))}
      </>
    ),
  },
  {
    label: "지역·근무 형태",
    render: (r) =>
      [
        r.posting.region,
        r.posting.employment,
        r.posting.workText,
        r.posting.remoteText,
      ]
        .filter(Boolean)
        .join(" · ") || missing,
  },
  {
    label: "일정",
    render: (r) =>
      [
        r.posting.duration,
        r.posting.startText,
        r.posting.deadline
          ? `마감 ${day(r.posting.deadline)}`
          : "마감일 미기재",
      ]
        .filter(Boolean)
        .join(" · "),
  },
  {
    label: "보상",
    render: (r) =>
      payConflict(r.posting) ? (
        "출처마다 다름"
      ) : r.posting.pay.kind === "unknown" ? (
        <span className="is-empty">{r.posting.pay.text}</span>
      ) : (
        r.posting.pay.text
      ),
  },
  {
    label: "내 기준과 맞는 점",
    render: (r, personal) =>
      !personal ? (
        <span className="is-empty">기준을 정하면 보여드려요</span>
      ) : r.lines.filter((l) => l.verdict === "match").length ? (
        <ul className="mini">
          {r.lines
            .filter((l) => l.verdict === "match")
            .map((l) => (
              <li key={l.key}>
                <VerdictMark verdict="match" size={14} />
                {l.key === "connect" ? l.note : `${l.label}: ${l.theirs}`}
              </li>
            ))}
        </ul>
      ) : (
        <span className="is-empty">확인된 것이 없어요</span>
      ),
  },
  {
    label: "확인할 사항",
    render: (r, personal) => {
      const items = r.lines.filter((l) => l.verdict !== "match");
      if (!personal)
        return <span className="is-empty">기준을 정하면 보여드려요</span>;
      if (!items.length) return <span className="is-empty">없어요</span>;
      return (
        <ul className="mini">
          {items.map((l) => (
            <li key={l.key}>
              <VerdictMark verdict={l.verdict} size={14} missing={l.about} />
              {l.about === "me" && l.verdict === "check"
                ? `내 경험 확인 필요 · ${l.theirs}`
                : l.note}
            </li>
          ))}
        </ul>
      );
    },
  },
];

export function Compare() {
  const { s, postings, now } = useWorld();
  const hydrated = useHydrated();
  const [second, setSecond] = useState(1);
  if (!hydrated)
    return <div className="page compare is-loading" aria-busy="true" />;

  const { criteria, experience, compare } = s.session;
  const personal = hasCriteria(criteria) || hasExperience(experience);
  const results = compare
    .map((id) => findPosting(postings, id))
    .filter((p) => p !== null)
    .map((p) => evaluate(p, criteria, experience, now));
  const mobileSecond = Math.min(second, results.length - 1);

  if (results.length < 2)
    return (
      <div className="page narrow">
        <nav className="crumb">
          <Link href="/explore">
            <ArrowLeft width={16} height={16} />
            탐색으로 돌아가기
          </Link>
        </nav>
        <h1 className="page-title">후보 비교</h1>
        <p className="muted">
          {results.length === 1
            ? "비교할 공고를 하나 더 선택하세요."
            : "공고 카드의 ‘비교’를 눌러 2~3개를 선택하세요."}{" "}
          공고 목록이나 저장한 공고에서 고를 수 있어요.
        </p>
        <div className="row-actions">
          <Link href="/explore" className="btn-primary">
            공고 고르러 가기
          </Link>
          <Link href="/saved" className="btn-secondary">
            저장한 공고에서 고르기
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page compare">
      <nav className="crumb">
        <Link href="/explore">
          <ArrowLeft width={16} height={16} />
          탐색으로 돌아가기
        </Link>
      </nav>
      <header className="page-head">
        <h1 className="page-title">후보 비교</h1>
        <p className="muted">
          같은 기준으로 한 줄씩 읽어요. 종합 순위나 추천 1위는 정하지 않아요.
        </p>
      </header>

      {results.length === 3 && (
        <div
          className="compare-picker mobile-only"
          role="radiogroup"
          aria-label="두 번째 열에 볼 공고"
        >
          <span>함께 볼 공고</span>
          {[1, 2].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={mobileSecond === i}
              onClick={() => setSecond(i)}
            >
              {results[i].posting.company}
            </button>
          ))}
        </div>
      )}

      <div
        className="compare-table"
        role="table"
        style={{ ["--cols" as string]: results.length }}
      >
        <div className="ct-row ct-head" role="row">
          <span className="ct-label" role="columnheader">
            <span className="sr-only">항목</span>
          </span>
          {results.map((r, i) => (
            <div
              key={r.posting.id}
              role="columnheader"
              className={`ct-cell ${i > 0 && i !== mobileSecond ? "mobile-hidden" : ""}`}
            >
              <p className="card-company">
                {r.posting.company}
                <StatusBadge availability={r.availability} />
              </p>
              <p className="ct-title">{r.posting.title}</p>
              {personal && (r.group === "excluded" || r.group === "closed") && (
                <p className="tag-warn">현재 조건과 달라요</p>
              )}
              <div className="ct-actions">
                <Link
                  href={`/jobs/${r.posting.id}`}
                  className="text-btn strong"
                  onClick={() => setOrigin("compare")}
                >
                  상세
                </Link>
                {r.posting.body && (
                  <Link
                    href={`/jobs/${r.posting.id}`}
                    className="text-btn"
                    onClick={() => {
                      setOrigin("compare");
                      openPrepareOn(r.posting.id);
                    }}
                  >
                    준비
                  </Link>
                )}
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => toggleCompare(r.posting.id)}
                  aria-label={`${r.posting.title} 비교에서 빼기`}
                >
                  <Close width={14} height={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {ROWS.map((row) => (
          <div className="ct-row" role="row" key={row.label}>
            <span className="ct-label" role="rowheader">
              {row.label}
            </span>
            {results.map((r, i) => (
              <div
                key={r.posting.id}
                role="cell"
                className={`ct-cell ${i > 0 && i !== mobileSecond ? "mobile-hidden" : ""}`}
              >
                {row.render(r, personal)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="results-foot">
        선택은 이 탐색 동안 유지돼요. 조건을 바꿔도 자동으로 해제하지 않아요.
      </p>
    </div>
  );
}
