import type { Availability, Posting } from "../_demo/fixtures";
import { day, dday, stamp } from "../_demo/format";
import type { Verdict } from "../_demo/match";
import { Clock, Info } from "./icons";

export const VERDICT_LABEL: Record<Verdict, string> = {
  match: "맞아요",
  check: "확인 필요",
  mismatch: "맞지 않아요",
};

/**
 * 판단 표식 — 작은 겹침. 왼쪽 원은 내 조건, 오른쪽 원은 공고.
 * 맞아요 = 두 필름이 겹침, 확인 필요 = 값이 없는 쪽이 점선 원, 맞지 않아요 = 떨어진 두 원.
 * 색만으로 구분하지 않도록 모양이 다르고, 화면에는 항상 텍스트 라벨이 함께 나온다.
 */
export function VerdictMark({
  verdict,
  size = 16,
  missing = "posting",
}: {
  verdict: Verdict;
  size?: number;
  missing?: "posting" | "me";
}) {
  const r = 6.4;
  const [mine, post] = verdict === "mismatch" ? [6.5, 17.5] : [8, 16];
  const empty = verdict === "check" ? missing : null;
  return (
    <svg
      className={`mark mark-${verdict}`}
      width={size * 1.5}
      height={size}
      viewBox="0 0 24 16"
      aria-hidden
    >
      <circle
        className={empty === "me" ? "m-empty" : "m-mine"}
        cx={mine}
        cy="8"
        r={r}
      />
      <circle
        className={empty === "posting" ? "m-empty" : "m-post"}
        cx={post}
        cy="8"
        r={r}
      />
    </svg>
  );
}

export function StatusBadge({ availability }: { availability: Availability }) {
  if (availability === "open") return null;
  const map = {
    closed: ["마감된 공고", "slate"],
    deadline_elapsed: ["마감일 지남", "ochre"],
    delayed: ["확인 지연", "ochre"],
    unknown: ["본문 미확보", "slate"],
  } as const;
  const [label, tone] = map[availability];
  return (
    <span className={`badge badge-${tone}`}>
      {tone === "ochre" ? (
        <Clock width={12} height={12} />
      ) : (
        <Info width={12} height={12} />
      )}
      {label}
    </span>
  );
}

export function Deadline({ posting, now }: { posting: Posting; now: string }) {
  if (!posting.deadline)
    return <span className="meta-missing">마감일 미기재</span>;
  return (
    <span className="deadline">
      ~{day(posting.deadline)}
      {posting.status.kind === "open" &&
        posting.deadline >= now.slice(0, 10) && (
          <span className="dday">{dday(posting.deadline, now)}</span>
        )}
    </span>
  );
}

/** 출처와 마지막 본문 확인 시각. 게시일로 대신하지 않는다. */
export function provenance(p: Posting) {
  const names = p.sources.map((s) => s.name).join(" · ");
  const where =
    p.sources.length > 1 ? `${names} (출처 ${p.sources.length}곳)` : names;
  if (p.status.kind === "unknown")
    return `${where} · 목록에서만 확인 ${stamp(p.listSeenAt)}`;
  if (p.status.kind === "delayed")
    return `${where} · ${stamp(p.status.lastOkAt)} 확인 · 이후 확인 지연`;
  return `${where} · ${stamp(p.status.checkedAt)} 본문 확인`;
}
