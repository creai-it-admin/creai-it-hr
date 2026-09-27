"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ALIASES,
  changesSince,
  findPosting,
  payConflict,
  type Posting,
} from "../_demo/fixtures";
import { day, stamp } from "../_demo/format";
import {
  evaluate,
  hasCriteria,
  hasExperience,
  type Line,
} from "../_demo/match";
import {
  acknowledge,
  clearSkill,
  openPrepareOn,
  setSkill,
  useHydrated,
  useWorld,
} from "../_demo/store";
import { ConditionSheet } from "./condition-sheet";
import { ArrowLeft, ArrowUpRight, Clock, Info } from "./icons";
import { SaveButton } from "./job-card";
import {
  Deadline,
  StatusBadge,
  VERDICT_LABEL,
  VerdictMark,
  provenance,
} from "./marks";
import { PrepareSheet } from "./prepare-sheet";

const STRENGTH_LABEL = {
  must: "꼭",
  nice: "선호",
  required: "공고 필수",
} as const;
const ORDER = { match: 0, check: 1, mismatch: 2 } as const;

/** 시그니처: 내 기준 ↔ 공고에 적힌 내용 ↔ 판단을 한 줄에 놓고, 근거를 누르면 원문 문장으로 이동한다. */
function Reconcile({
  lines,
  onJump,
}: {
  lines: Line[];
  onJump: (ev: string) => void;
}) {
  const sorted = [...lines].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  return (
    <div className="reconcile" role="table" aria-label="내 기준과 공고 비교">
      <div className="rc-row rc-head" role="row">
        <span role="columnheader">판단</span>
        <span role="columnheader">기준</span>
        <span role="columnheader">내가 알려준 것</span>
        <span role="columnheader">공고에 적힌 것</span>
      </div>
      {sorted.map((l) => (
        <div key={l.key} className={`rc-row is-${l.verdict}`} role="row">
          <span className="rc-verdict" role="cell">
            <VerdictMark verdict={l.verdict} missing={l.about} />
            {VERDICT_LABEL[l.verdict]}
          </span>
          <span className="rc-label" role="cell">
            {l.label}
            <small>{STRENGTH_LABEL[l.strength]}</small>
          </span>
          <span
            className={`rc-mine ${l.mine === "입력하지 않음" ? "is-empty" : ""}`}
            role="cell"
          >
            <span className="rc-cell-label">나</span>
            {l.mine}
          </span>
          <span className="rc-theirs" role="cell">
            <span className="rc-cell-label">공고</span>
            <span className={l.theirs === "공고에 없음" ? "is-empty" : ""}>
              {l.theirs}
            </span>
            {l.ev && (
              <button
                type="button"
                className="cite"
                onClick={() => onJump(l.ev!)}
                aria-label={`${l.label} 근거 문장 보기`}
              >
                근거
              </button>
            )}
            {l.verdict !== "match" && (
              <small className="rc-note">{l.note}</small>
            )}
            {l.key === "connect" && (
              <small className="rc-note">
                {l.note}. 연결되는 경험이라는 뜻이지, 같은 직무 경력으로
                인정된다는 뜻은 아니에요.
              </small>
            )}
            {l.skill && l.verdict !== "check" && (
              <button
                type="button"
                className="text-btn"
                onClick={() => clearSkill(l.skill!)}
              >
                다시 고르기
              </button>
            )}
            {l.skill && l.verdict === "check" && (
              <span className="rc-fix">
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => setSkill(l.skill!, true)}
                >
                  써봤어요
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => setSkill(l.skill!, false)}
                >
                  아직 안 써봤어요
                </button>
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function Fact({
  label,
  value,
  ev,
  onJump,
}: {
  label: string;
  value: string | null;
  ev?: string;
  onJump: (ev: string) => void;
}) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className={value ? "" : "is-empty"}>
        {value ?? "공고에 없음"}
        {value && ev && (
          <button
            type="button"
            className="cite"
            onClick={() => onJump(ev)}
            aria-label={`${label} 근거 문장 보기`}
          >
            근거
          </button>
        )}
      </dd>
    </div>
  );
}

function StatusBanner({
  p,
  availability,
}: {
  p: Posting;
  availability: string;
}) {
  if (availability === "closed")
    return (
      <div className="banner banner-slate" role="status">
        <Info />
        <p>
          <b>마감된 공고예요.</b> 원문에서 마감이 확인됐어요(
          {stamp(p.status.checkedAt)} 확인). 원문은 볼 수 있지만 지금 지원할 수
          있다는 뜻은 아니에요.
        </p>
      </div>
    );
  if (availability === "deadline_elapsed")
    return (
      <div className="banner banner-ochre" role="status">
        <Clock />
        <p>
          <b>기재된 마감일({day(p.deadline!)})이 지났어요.</b> 원문에서 상태를
          확인하세요. 원문이 마감을 명시한 것과는 달라요.
        </p>
      </div>
    );
  if (availability === "delayed")
    return (
      <div className="banner banner-ochre" role="status">
        <Clock />
        <p>
          <b>최근 상태 확인이 지연되고 있어요.</b> 아래 내용은{" "}
          {stamp(p.status.lastOkAt)} 확인 기준이에요. 자동으로 마감 처리하지
          않았어요.
        </p>
      </div>
    );
  if (availability === "unknown")
    return (
      <div className="banner banner-slate" role="status">
        <Info />
        <p>
          <b>공고 본문을 확보하지 못했어요.</b> 목록에서 확인한 제목·회사·출처만
          보여드려요. 업무와 자격은 원문에서 확인하세요.
        </p>
      </div>
    );
  return null;
}

function NotFound() {
  return (
    <div className="page narrow not-found">
      <p className="eyebrow">공고를 찾을 수 없음</p>
      <h1>이 주소의 공고를 찾을 수 없어요</h1>
      <p>
        주소가 잘못됐거나 오래된 링크일 수 있어요. 비슷한 이름의 다른 공고로
        자동 이동하지 않았어요.
      </p>
      <Link href="/" className="btn-primary">
        기회 찾기로 돌아가기
      </Link>
    </div>
  );
}

export function JobDetail({ id }: { id: string }) {
  const { s, postings, now } = useWorld();
  const hydrated = useHydrated();
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!hydrated)
    return <div className="page detail is-loading" aria-busy="true" />;
  const p = findPosting(postings, id);
  if (!p) return <NotFound />;

  const { criteria, experience, origin, searched } = s.session;
  const r = evaluate(p, criteria, experience, now);
  const personal = hasCriteria(criteria) || hasExperience(experience);
  const saved = s.local.saved.find((x) => x.id === p.id);
  const change = saved ? changesSince(p, saved.seenVersion) : null;
  const closed = r.availability === "closed";
  const primary = p.sources[0];
  const back =
    origin === "explore"
      ? { href: "/explore", label: "탐색으로 돌아가기" }
      : origin === "saved"
        ? { href: "/saved", label: "저장한 공고로 돌아가기" }
        : origin === "compare"
          ? { href: "/compare", label: "비교로 돌아가기" }
          : { href: searched ? "/explore" : "/", label: "다른 기회 찾기" };
  const cited = new Set(
    [
      ...r.lines.map((l) => l.ev),
      ...p.tasks.map((t) => t.ev),
      ...p.required.map((q) => q.ev),
      ...p.preferred.map((q) => q.ev),
      ...Object.values(p.evidence),
    ].filter(Boolean),
  );
  const jump = (ev: string) => {
    setActive(ev);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById(`ev-${ev}`)?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  };
  const counts = { match: 0, check: 0, mismatch: 0 };
  r.lines.forEach((l) => counts[l.verdict]++);
  const reqLine = (key: string) => r.lines.find((l) => l.key === key);

  const actions = p.body ? (
    <>
      <a
        className="btn-primary"
        href={`/demo/original/${primary.ref}`}
        target="_blank"
        rel="noreferrer"
      >
        원문에서 확인 <ArrowUpRight width={16} height={16} />
      </a>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => openPrepareOn(p.id)}
      >
        {closed ? "유사 기회 준비에 활용" : "이 공고 준비하기"}
      </button>
    </>
  ) : (
    <a
      className="btn-primary"
      href={`/demo/original/${primary.ref}`}
      target="_blank"
      rel="noreferrer"
    >
      원문에서 내용 확인 <ArrowUpRight width={16} height={16} />
    </a>
  );

  return (
    <div className="page detail">
      <nav className="crumb" aria-label="이동">
        <Link href={back.href}>
          <ArrowLeft width={16} height={16} />
          {back.label}
        </Link>
      </nav>

      <div className="detail-grid">
        <article className="detail-main">
          {ALIASES[id] && (
            <p className="notice notice-quiet">
              <Info width={16} height={16} />
              요청한 인크루트 공고({id})는 사람인 공고와 같은 모집으로 확인돼
              함께 보여드려요.
            </p>
          )}
          <StatusBanner p={p} availability={r.availability} />
          {change && change.kind !== "same" && (
            <div className="banner banner-blue" role="status">
              <Info />
              <div>
                <p>
                  <b>저장한 뒤 내용이 바뀌었어요.</b>
                </p>
                {change.kind === "changed" ? (
                  <ul className="diff">
                    {change.rows.map((row) => (
                      <li key={row.label}>
                        {row.label} <s>{row.before}</s> → <b>{row.after}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>마지막 확인 이후 변경 여부를 알 수 없어요.</p>
                )}
                <button
                  type="button"
                  className="text-btn strong"
                  onClick={() => acknowledge(p.id, p.version)}
                >
                  확인했어요
                </button>
              </div>
            </div>
          )}

          <header className="detail-head">
            <p className="detail-company">
              {p.company}
              <StatusBadge availability={r.availability} />
              {p.sources.length > 1 && (
                <span className="badge badge-quiet">
                  출처 {p.sources.length}곳
                </span>
              )}
            </p>
            <div className="detail-title-row">
              <h1>{p.title}</h1>
              <SaveButton id={p.id} withLabel />
            </div>
            <p className="card-meta">
              {[
                p.region,
                p.employment,
                p.career?.text,
                p.workText,
                p.remoteText,
              ]
                .filter(Boolean)
                .map((m) => (
                  <span key={m}>{m}</span>
                ))}
              <Deadline posting={p} now={now} />
            </p>
            <p className="provenance">{provenance(p)}</p>
          </header>

          <div className="detail-actions-inline">{actions}</div>

          <section className="block" aria-labelledby="compare-title">
            <header className="block-head">
              <h2 id="compare-title">내 기준과 비교</h2>
              {personal && (
                <p className="block-tally">
                  <span>
                    <VerdictMark verdict="match" size={14} /> {counts.match}
                  </span>
                  {counts.check > 0 && (
                    <span>
                      <VerdictMark verdict="check" size={14} /> {counts.check}
                    </span>
                  )}
                  {counts.mismatch > 0 && (
                    <span>
                      <VerdictMark verdict="mismatch" size={14} />{" "}
                      {counts.mismatch}
                    </span>
                  )}
                </p>
              )}
            </header>
            {r.group === "excluded" && (
              <p className="notice notice-quiet">
                <Info width={16} height={16} />
                알려진 필수 불일치가 있어 목록 추천에서는 빠져요. 이 상세는 계속
                볼 수 있어요.
              </p>
            )}
            {!p.body ? (
              <p className="muted">
                확인할 업무 정보가 없어 맞는 이유를 만들지 않았어요.
              </p>
            ) : personal && r.lines.length ? (
              <Reconcile lines={r.lines} onJump={jump} />
            ) : (
              <div className="invite">
                <p>
                  지역·근무일 같은 조건을 알려주시면 이 공고의 내용과 한 줄씩
                  대조해 드려요.
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditing(true)}
                >
                  내 조건으로 살펴보기
                </button>
              </div>
            )}
          </section>

          {p.body && (
            <>
              <section className="block">
                <h2>하게 될 일</h2>
                <ul className="tasks">
                  {p.tasks.map((t) => (
                    <li key={t.text}>
                      {t.text}
                      <button
                        type="button"
                        className="cite"
                        onClick={() => jump(t.ev)}
                        aria-label={`${t.text} 근거 문장 보기`}
                      >
                        근거
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="block">
                <h2>지원 전에 확인할 것</h2>
                <div className="reqs">
                  <div>
                    <h3>필수</h3>
                    {p.required.length ? (
                      <ul>
                        {p.required.map((q) => {
                          const line = reqLine(
                            q.skill ? `req:${q.skill}` : "req:career",
                          );
                          return (
                            <li key={q.label}>
                              {personal && line && (
                                <VerdictMark
                                  verdict={line.verdict}
                                  size={15}
                                  missing={line.about}
                                />
                              )}
                              <span>{q.label}</span>
                              {q.ev && (
                                <button
                                  type="button"
                                  className="cite"
                                  onClick={() => jump(q.ev!)}
                                >
                                  근거
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="is-empty">공고에 없음</p>
                    )}
                  </div>
                  <div>
                    <h3>우대</h3>
                    {p.preferred.length ? (
                      <ul>
                        {p.preferred.map((q) => (
                          <li key={q.label}>
                            <span>{q.label}</span>
                            {q.ev && (
                              <button
                                type="button"
                                className="cite"
                                onClick={() => jump(q.ev!)}
                              >
                                근거
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="is-empty">공고에 없음</p>
                    )}
                  </div>
                </div>
                <p className="form-note">
                  우대 요건은 없어도 지원할 수 있어요. 필수 요건과 섞어 판단하지
                  않아요.
                </p>
              </section>
            </>
          )}

          <section className="block">
            <h2>근무 조건·일정</h2>
            <dl className="facts">
              <Fact
                label="지역"
                value={p.region}
                ev={p.evidence.region}
                onJump={jump}
              />
              <Fact
                label="고용 형태"
                value={p.employment}
                ev={p.evidence.employment}
                onJump={jump}
              />
              <Fact
                label="경력"
                value={p.career?.text ?? null}
                ev={p.evidence.career}
                onJump={jump}
              />
              <Fact
                label="근무일"
                value={p.workText}
                ev={p.evidence.workDays}
                onJump={jump}
              />
              <Fact
                label="근무 방식"
                value={p.remoteText}
                ev={p.evidence.remote}
                onJump={jump}
              />
              <Fact label="기간" value={p.duration} onJump={jump} />
              <Fact
                label="시작"
                value={p.startText}
                ev={p.evidence.start}
                onJump={jump}
              />
              <Fact
                label="보상"
                value={
                  payConflict(p)
                    ? "출처마다 다름 · 아래 출처별 표기 확인"
                    : p.pay.kind === "unknown"
                      ? p.pay.text === "공고에 없음"
                        ? null
                        : p.pay.text
                      : p.pay.text
                }
                ev={p.evidence.pay}
                onJump={jump}
              />
              <Fact
                label="마감"
                value={p.deadline ? day(p.deadline) : null}
                ev={p.evidence.deadline}
                onJump={jump}
              />
            </dl>
          </section>

          <section className="block" aria-labelledby="source-title">
            <h2 id="source-title">공고 내용과 출처</h2>
            {p.body ? (
              <div className="source-body">
                {p.body.map((b) => (
                  <p
                    key={b.id}
                    id={`ev-${b.id}`}
                    className={`${cited.has(b.id) ? "is-cited" : ""} ${active === b.id ? "is-active" : ""}`}
                    tabIndex={-1}
                  >
                    {b.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="muted">
                확보한 본문이 없어요. 원문에서 내용을 확인하세요.
              </p>
            )}
            {p.bodyNote && (
              <p className="notice notice-quiet">
                <Info width={16} height={16} />
                {p.bodyNote}
              </p>
            )}
            {payConflict(p) && (
              <div className="conflict">
                <p>
                  <b>출처마다 연봉이 다르게 적혀 있어요.</b> 어느 값이 맞는지
                  원문별로 확인하세요. 하나로 합치지 않았어요.
                </p>
                <table>
                  <tbody>
                    {p.sources.map((src) => (
                      <tr key={src.ref}>
                        <th scope="row">{src.name}</th>
                        <td>
                          {src.pay?.kind !== "unknown"
                            ? src.pay?.text
                            : "미기재"}
                        </td>
                        <td className="mono">{stamp(src.verifiedAt)} 확인</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ul className="sources">
              {p.sources.map((src) => (
                <li key={src.ref}>
                  <span className="source-name">{src.name}</span>
                  <span className="mono">
                    {src.ref} ·{" "}
                    {src.verifiedAt
                      ? `마지막 본문 확인 ${stamp(src.verifiedAt)}`
                      : `목록에서만 확인 ${stamp(p.listSeenAt)}`}
                  </span>
                  <a
                    href={`/demo/original/${src.ref}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-btn"
                  >
                    원문 보기 <ArrowUpRight width={14} height={14} />
                  </a>
                </li>
              ))}
            </ul>
            {p.sameProof && p.sources.length > 1 && (
              <p className="form-note">
                {p.sameProof}로 같은 모집임을 확인해 하나로 보여드려요. 제목이
                비슷한 것만으로는 묶지 않아요.
              </p>
            )}
          </section>
        </article>

        <aside className="detail-rail" aria-label="이 공고로 할 수 있는 일">
          <div className="rail-card">
            <div className="rail-actions">{actions}</div>
            <p className="rail-note">
              원문으로 이동해도 지원 완료로 기록하지 않아요.
            </p>
            {personal && p.body && (
              <ul className="rail-summary">
                {r.reasons.slice(0, 2).map((x) => (
                  <li key={x}>
                    <VerdictMark verdict="match" size={14} />
                    {x}
                  </li>
                ))}
                {r.check && (
                  <li>
                    <VerdictMark
                      verdict="check"
                      size={14}
                      missing={r.check.about}
                    />
                    {r.check.note}
                  </li>
                )}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className="mobile-actions">{actions}</div>

      {s.session.prepareFor === p.id && p.body && (
        <PrepareSheet
          posting={p}
          result={r}
          now={now}
          onClose={() => openPrepareOn(null)}
        />
      )}
      <ConditionSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
