"use client";

import Link from "next/link";
import { changesSince } from "../_demo/fixtures";
import type { Evaluation } from "../_demo/match";
import {
  hide,
  isSaved,
  setOrigin,
  toggleCompare,
  toggleSave,
  useApp,
  type Origin,
} from "../_demo/store";
import { Bookmark, EyeOff } from "./icons";
import { Deadline, StatusBadge, VerdictMark, provenance } from "./marks";

export function SaveButton({
  id,
  withLabel,
}: {
  id: string;
  withLabel?: boolean;
}) {
  const s = useApp();
  const saved = isSaved(s, id);
  return (
    <button
      type="button"
      className={`save-btn ${saved ? "is-saved" : ""} ${withLabel ? "with-label" : ""}`}
      aria-pressed={saved}
      aria-label={
        withLabel ? undefined : saved ? "저장됨, 저장 해제" : "이 공고 저장"
      }
      onClick={() => toggleSave(id)}
    >
      <Bookmark filled={saved} />
      {withLabel && (saved ? "저장됨" : "저장")}
    </button>
  );
}

/** 공고 카드. 정보 순서는 고정한다: 회사·직무 → 실제 업무 → 조건 → 맞는 이유·확인할 점 → 출처·확인 시각 */
export function JobCard({
  result,
  now,
  personal,
  origin,
  canHide,
}: {
  result: Evaluation;
  now: string;
  personal: boolean;
  origin: Origin;
  canHide?: boolean;
}) {
  const s = useApp();
  const p = result.posting;
  const saved = s.local.saved.find((x) => x.id === p.id);
  const change = saved ? changesSince(p, saved.seenVersion) : null;
  const comparing = s.session.compare.includes(p.id);
  const meta = [
    p.region,
    p.employment,
    p.career?.text,
    p.workText,
    p.remoteText,
  ].filter(Boolean);
  const showEvidence = personal && (result.reasons.length > 0 || result.check);

  return (
    <article className={`card state-${result.availability}`}>
      <div className="card-head">
        <div className="card-heading">
          <p className="card-company">
            {p.company}
            <StatusBadge availability={result.availability} />
            {p.sources.length > 1 && (
              <span className="badge badge-quiet">
                출처 {p.sources.length}곳
              </span>
            )}
          </p>
          <h3 className="card-title">
            <Link
              href={`/jobs/${p.id}`}
              className="card-link"
              onClick={() => setOrigin(origin)}
            >
              {p.title}
            </Link>
          </h3>
        </div>
        <SaveButton id={p.id} />
      </div>

      <p className={`card-summary ${p.summary ? "" : "is-missing"}`}>
        {p.summary ?? "업무 내용을 확보하지 못했어요. 원문에서 확인하세요."}
      </p>

      <p className="card-meta">
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
        <Deadline posting={p} now={now} />
      </p>

      {showEvidence && (
        <ul className="card-evidence">
          {result.reasons.map((r) => (
            <li key={r}>
              <VerdictMark verdict="match" size={15} />
              <span>{r}</span>
            </li>
          ))}
          {result.check && (
            <li className="is-check">
              <VerdictMark
                verdict="check"
                size={15}
                missing={result.check.about}
              />
              <span>{result.check.note}</span>
            </li>
          )}
        </ul>
      )}

      {change && change.kind !== "same" && (
        <div className="card-change">
          <strong>내용 변경</strong>
          {change.kind === "changed" ? (
            change.rows.map((r) => (
              <span key={r.label}>
                {r.label} <s>{r.before}</s> → <b>{r.after}</b>
              </span>
            ))
          ) : (
            <span>마지막 확인 이후 변경 여부를 알 수 없어요</span>
          )}
        </div>
      )}

      <div className="card-foot">
        <span className="provenance">{provenance(p)}</span>
        <div className="card-actions">
          {canHide && (
            <button
              type="button"
              className="text-btn quiet"
              onClick={() => hide(p.id)}
            >
              <EyeOff width={15} height={15} />
              숨기기
            </button>
          )}
          <label className={`compare-toggle ${comparing ? "is-on" : ""}`}>
            <input
              type="checkbox"
              checked={comparing}
              onChange={() => toggleCompare(p.id)}
              aria-label={`${p.title} 비교에 추가`}
            />
            비교
          </label>
        </div>
      </div>
    </article>
  );
}
