"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  exploreResults,
  hasCriteria,
  suggestRelaxation,
  type Evaluation,
  type Sort,
} from "../_demo/match";
import {
  applyCriteria,
  ask,
  cancelPending,
  resolveProposal,
  setAssistantOpen,
  setDraft,
  setSort,
  unhide,
  useApp,
  useHydrated,
  useWorld,
  type Message,
} from "../_demo/store";
import { ConditionSheet } from "./condition-sheet";
import { CriteriaLedger, ReceiptLine } from "./criteria";
import { ArrowUp, Close, Info, Panel } from "./icons";
import { JobCard } from "./job-card";
import { CompareBar } from "./shell";

// 상세에 다녀와도 같은 자리로 돌아오게 하는 스크롤 기억 (이 탭의 메모리에만).
let scrollMemory = { key: "", y: 0 };

function Composer({ compact }: { compact?: boolean }) {
  const { session, pending } = useApp();
  const send = () => ask(session.draft);
  return (
    <form
      className={`chat-composer ${compact ? "is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="sr-only" htmlFor="chat-input">
        조건을 말로 바꾸기
      </label>
      <textarea
        id="chat-input"
        rows={2}
        value={session.draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="예: 지역은 아무 데나 괜찮아요"
      />
      <button
        type="submit"
        className="send"
        aria-label="보내기"
        disabled={!session.draft.trim()}
      >
        <ArrowUp />
      </button>
      {pending && (
        <button
          type="button"
          className="text-btn cancel"
          onClick={cancelPending}
        >
          요청 취소
        </button>
      )}
    </form>
  );
}

function AssistantMessage({
  m,
  latest,
  onShowResults,
}: {
  m: Extract<Message, { role: "assistant" }>;
  latest: boolean;
  onShowResults: () => void;
}) {
  return (
    <div className={`msg msg-assistant ${m.error ? "is-error" : ""}`}>
      {m.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {m.error && latest && (
        <div className="msg-actions">
          <button
            type="button"
            className="chip-btn"
            onClick={() => ask(m.error!.retry)}
          >
            다시 시도
          </button>
          <span className="muted">
            대화 없이도 조건 편집과 원문 확인, 준비 프롬프트는 그대로 쓸 수
            있어요.
          </span>
        </div>
      )}
      {m.proposal && (
        <div className="msg-proposal">
          <p>{m.proposal.text}</p>
          {m.proposal.resolved ? (
            <p className="muted">
              {m.proposal.resolved === "accepted"
                ? "바꿨어요"
                : "기존 조건을 유지했어요"}
            </p>
          ) : (
            <div className="msg-actions">
              <button
                type="button"
                className="chip-btn strong"
                onClick={() => resolveProposal(m.id, true)}
              >
                {m.proposal.accept}
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => resolveProposal(m.id, false)}
              >
                {m.proposal.keep}
              </button>
            </div>
          )}
        </div>
      )}
      {m.question && (
        <div className="msg-question">
          <p>{m.question.text}</p>
          {latest && (
            <div className="msg-actions">
              {m.question.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="chip-btn"
                  onClick={() => ask(o)}
                >
                  {o}
                </button>
              ))}
              <button
                type="button"
                className="chip-btn quiet"
                onClick={onShowResults}
              >
                일단 공고 보기
              </button>
            </div>
          )}
        </div>
      )}
      {m.counts && (
        <p className="msg-counts">
          조건에 맞는 공고 {m.counts.match}개 · 확인이 필요한 공고{" "}
          {m.counts.check}개
          <button
            type="button"
            className="text-btn strong mobile-only"
            onClick={onShowResults}
          >
            공고 {m.counts.match + m.counts.check}개 보기
          </button>
        </p>
      )}
    </div>
  );
}

function Assistant({
  onShowResults,
  onCollapse,
}: {
  onShowResults: () => void;
  onCollapse: () => void;
}) {
  const { session, pending } = useApp();
  const end = useRef<HTMLDivElement>(null);
  const count = session.messages.length;
  const lastAssistant = [...session.messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [count, pending]);

  return (
    <div className="assistant-inner">
      <div className="assistant-head">
        <p>
          <span className="assistant-dot" aria-hidden />
          탐색 도우미
        </p>
        <button
          type="button"
          className="icon-btn desktop-only"
          onClick={onCollapse}
          aria-label="탐색 도우미 접기"
        >
          <Close width={16} height={16} />
        </button>
      </div>
      <div className="assistant-log" aria-live="polite">
        {count === 0 && (
          <div className="msg msg-assistant is-intro">
            <p>
              원하는 일이나 현실적인 조건을 문장으로 말해 주세요. 알아들은
              조건은 결과 위의 칩으로 바로 보여드려요.
            </p>
            <p className="muted">
              예: “학기 중이라 주 3일만 가능해요”, “서울이면 좋겠어요”
            </p>
          </div>
        )}
        {session.messages.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className={`msg msg-user ${m.dropped ? "is-dropped" : ""}`}
            >
              <p>{m.text}</p>
              {m.dropped && (
                <span className="msg-note">
                  {m.dropped === "canceled"
                    ? "요청을 취소했어요"
                    : "새 요청으로 바뀌었어요"}
                </span>
              )}
            </div>
          ) : (
            <AssistantMessage
              key={m.id}
              m={m}
              latest={m.id === lastAssistant && !pending}
              onShowResults={onShowResults}
            />
          ),
        )}
        {pending && (
          <p className="msg-pending">
            <span className="pulse" aria-hidden />
            말씀하신 조건으로 공고를 찾고 있어요
          </p>
        )}
        <div ref={end} />
      </div>
      <Composer />
    </div>
  );
}

function Group({
  title,
  note,
  items,
  now,
  personal,
  limit,
  tone,
}: {
  title: string;
  note?: string;
  items: Evaluation[];
  now: string;
  personal: boolean;
  limit?: number;
  tone?: "check";
}) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <section className={`group ${tone ? `group-${tone}` : ""}`}>
      <header className="group-head">
        <h2>
          {title} <span className="count">{items.length}</span>
        </h2>
        {note && <p>{note}</p>}
      </header>
      <div className="card-list">
        {shown.map((r) => (
          <JobCard
            key={r.posting.id}
            result={r}
            now={now}
            personal={personal}
            origin="explore"
            canHide
          />
        ))}
      </div>
      {limit && !all && items.length > limit && (
        <button
          type="button"
          className="btn-secondary more"
          onClick={() => setAll(true)}
        >
          더 보기 <span className="muted">{items.length - limit}개</span>
        </button>
      )}
    </section>
  );
}

export function Explore() {
  const { s, postings, now } = useWorld();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<"results" | "chat">("results");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<false | "all" | "experience">(false);
  const [dismissed, setDismissed] = useState("");
  const top = useRef<HTMLDivElement>(null);

  const { criteria, experience, hidden } = s.session;
  const sort: Sort =
    s.session.sort ?? (hasCriteria(criteria) ? "relevance" : "recent");
  const results = exploreResults(postings, criteria, experience, now, {
    hidden,
    coverageLimited: s.demo.variants.includes("V5"),
    sort,
  });
  const signature = JSON.stringify([
    criteria,
    experience.skills,
    hidden,
    sort,
    s.demo.variants,
  ]);
  // 내 정보만 보태면 판단할 수 있는 경우를 먼저 안내하고, 필수 조건 완화는 그다음에 제안한다.
  const meNeeded = results.check.some((r) => r.check?.about === "me");
  const suggestion =
    results.personal &&
    !results.match.length &&
    !results.coverage &&
    !meNeeded &&
    dismissed !== signature
      ? suggestRelaxation(postings, criteria, experience, now)
      : null;

  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [drawer]);

  // 상세에서 돌아오면 이전 스크롤 복원, 조건이 바뀌면 새 결과의 시작을 보여준다.
  const receiptId = s.session.receipt?.id;
  useEffect(() => {
    if (!hydrated) return;
    if (scrollMemory.key === signature && scrollMemory.y > 0) {
      const y = scrollMemory.y;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
    const onScroll = () =>
      (scrollMemory = { key: signature, y: window.scrollY });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hydrated, signature]);
  useEffect(() => {
    if (!receiptId || !top.current) return;
    const y = top.current.getBoundingClientRect().top + window.scrollY - 120;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  }, [receiptId]);

  if (!hydrated)
    return <div className="page explore is-loading" aria-busy="true" />;

  const assistantOpen = s.session.assistantOpen;
  const total = results.match.length + results.check.length;

  return (
    <div
      className={`page explore ${assistantOpen ? "with-assistant" : ""} ${drawer ? "drawer-open" : ""}`}
      data-tab={tab}
    >
      <aside className="assistant" aria-label="탐색 도우미">
        <Assistant
          onShowResults={() => {
            setTab("results");
            setDrawer(false);
          }}
          onCollapse={() =>
            drawer ? setDrawer(false) : setAssistantOpen(false)
          }
        />
      </aside>
      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
      )}

      <section className="results" aria-labelledby="results-title">
        <header className="results-head" ref={top}>
          <div className="results-title">
            <h1 id="results-title">기회 찾기</h1>
            <button
              type="button"
              className={`btn-ghost assistant-toggle ${assistantOpen ? "is-desktop-hidden" : ""}`}
              onClick={() => {
                setAssistantOpen(true);
                setDrawer(true);
              }}
            >
              <Panel />
              탐색 도우미
            </button>
          </div>
          <CriteriaLedger
            criteria={criteria}
            onEdit={() => setEditing("all")}
          />
          <ReceiptLine />
        </header>

        <div className="tabs mobile-only" role="tablist" aria-label="탐색 화면">
          <button
            role="tab"
            aria-selected={tab === "results"}
            onClick={() => setTab("results")}
          >
            공고{" "}
            <span className="count">
              {results.personal ? total : results.match.length}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "chat"}
            onClick={() => setTab("chat")}
          >
            조건·대화
          </button>
        </div>

        <div className="results-body">
          <div className="results-bar">
            <p className="results-summary">
              {results.personal
                ? `조건에 맞는 공고 ${results.match.length}개 · 확인이 필요한 공고 ${results.check.length}개`
                : `샘플 공고 ${results.match.length}개 · 최근 수집순`}
            </p>
            <label className="sort">
              <span className="sr-only">정렬</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                {hasCriteria(criteria) && (
                  <option value="relevance">조건 관련순</option>
                )}
                <option value="recent">최근 수집순</option>
                <option value="deadline">마감 가까운순</option>
              </select>
            </label>
          </div>

          {results.coverage && (
            <div className="notice notice-coverage" role="status">
              <Info />
              <div>
                <p>
                  <b>현재 확보한 경력직 공고가 제한적이에요.</b>
                </p>
                <p>
                  조건에 맞는 일자리가 없다는 뜻이 아니에요. 지금은 신입·인턴
                  공고를 중심으로 모으고 있어요. 조건은 그대로 둘게요.
                </p>
              </div>
            </div>
          )}

          {!results.personal ? (
            <Group
              title="최근 수집한 공고"
              note="게시일이 아니라 마지막으로 본문을 확인한 시각 순서예요."
              items={results.match}
              now={now}
              personal={false}
              limit={6}
            />
          ) : (
            <>
              {results.match.length > 0 ? (
                <Group
                  title="조건에 맞는 공고"
                  note="꼭 맞아야 할 조건의 값이 공고에서 확인되고, 알려진 불일치가 없는 공고예요. 지원 자격 전체를 검증했다는 뜻은 아니에요."
                  items={results.match}
                  now={now}
                  personal
                />
              ) : (
                !results.coverage && (
                  <section className="zero" aria-live="polite">
                    <h2>적용한 조건과 모두 맞는 공고는 아직 없어요</h2>
                    <p className="muted">
                      조건을 자동으로 넓히지 않았어요. 필요한 경우에만 하나씩
                      바꿔 보세요.
                    </p>
                    {suggestion ? (
                      <div className="suggestion">
                        <span className="chip chip-proposal is-static">
                          제안
                        </span>
                        <div>
                          <p>
                            <b>{suggestion.text}</b>
                          </p>
                          <p className="muted">{suggestion.detail}</p>
                        </div>
                        <div className="suggestion-actions">
                          <button
                            type="button"
                            className="btn-primary small"
                            onClick={() =>
                              applyCriteria(
                                suggestion.apply,
                                suggestion.receipt,
                              )
                            }
                          >
                            {suggestion.label}
                          </button>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => setDismissed(signature)}
                          >
                            지금 조건 유지
                          </button>
                        </div>
                      </div>
                    ) : meNeeded ? (
                      <div className="suggestion">
                        <span className="chip chip-proposal is-static">
                          도움말
                        </span>
                        <p>
                          아래 공고는 <b>내 경험 정보</b>가 없어서 판단하지
                          못했어요. 사용해 본 기술을 알려주시면 다시 나눠
                          드려요.
                        </p>
                        <button
                          type="button"
                          className="btn-secondary small"
                          onClick={() => setEditing("experience")}
                        >
                          경험 입력하기
                        </button>
                      </div>
                    ) : null}
                  </section>
                )
              )}
              {results.check.length > 0 && (
                <Group
                  title="추가 확인이 필요한 공고"
                  note="꼭 맞아야 할 조건과 관련된 값이 공고나 내 정보에 없어요. 무엇을 확인해야 하는지 카드에 적어 두었어요."
                  items={results.check}
                  now={now}
                  personal
                  tone="check"
                />
              )}
            </>
          )}

          {results.status.length > 0 && (
            <details className="status-group">
              <summary>
                지금 상태를 판단하기 어려운 공고{" "}
                <span className="count">{results.status.length}</span>
                <span className="muted">
                  마감일이 지났거나, 상태 확인이 지연됐거나, 본문을 확보하지
                  못한 공고예요
                </span>
              </summary>
              <div className="card-list">
                {results.status.map((r) => (
                  <JobCard
                    key={r.posting.id}
                    result={r}
                    now={now}
                    personal={results.personal}
                    origin="explore"
                  />
                ))}
              </div>
            </details>
          )}

          {results.hidden.length > 0 && (
            <p className="hidden-note">
              이번 탐색에서 숨긴 공고 {results.hidden.length}개 ·{" "}
              {results.hidden.map((r) => (
                <button
                  key={r.posting.id}
                  type="button"
                  className="text-btn"
                  onClick={() => unhide(r.posting.id)}
                >
                  {r.posting.title} 다시 보기
                </button>
              ))}
            </p>
          )}

          <p className="results-foot">
            수집한 공고 안에서만 찾아요. 추천 순서에는 교육 연결이나 유료 노출을
            반영하지 않아요. <Link href="/">처음으로</Link>
          </p>
        </div>
      </section>

      <ConditionSheet
        open={Boolean(editing)}
        focus={editing === "experience" ? "experience" : undefined}
        onClose={() => setEditing(false)}
      />
      <CompareBar />
    </div>
  );
}
