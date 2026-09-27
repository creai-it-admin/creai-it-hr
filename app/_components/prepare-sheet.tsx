"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { availability, type Posting } from "../_demo/fixtures";
import { criteriaItems, type Evaluation } from "../_demo/match";
import { buildPrompt, PURPOSES, type Purpose } from "../_demo/prompt";
import { useApp } from "../_demo/store";
import { ArrowUpRight, Check, Copy, Info } from "./icons";
import { Sheet } from "./sheet";

/** S05 준비 프롬프트. 목적 → 포함할 내 맥락 → 전달할 내용 확인 → 복사. 모델을 호출하지 않는다. */
export function PrepareSheet({
  posting,
  result,
  now,
  onClose,
}: {
  posting: Posting;
  result: Evaluation;
  now: string;
  onClose: () => void;
}) {
  const s = useApp();
  const closed = availability(posting, now) === "closed";
  const sessionExperience = s.session.experience.text;
  const criteriaText = criteriaItems(s.session.criteria)
    .map((i) => `${i.label}(${i.strength === "must" ? "꼭" : "선호"})`)
    .join(" · ");

  const [purpose, setPurpose] = useState<Purpose>("strategy");
  const [useSession, setUseSession] = useState(false);
  const [extra, setExtra] = useState("");
  const [useCriteria, setUseCriteria] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [copy, setCopy] = useState<{
    state: "idle" | "done" | "failed";
    text: string;
  }>({ state: "idle", text: "" });
  const manual = useRef<HTMLTextAreaElement>(null);

  const experience = [useSession ? sessionExperience : "", extra.trim()]
    .filter(Boolean)
    .join(" ");
  const prompt = useMemo(
    () =>
      buildPrompt({
        posting,
        now,
        purpose,
        experience,
        criteria: useCriteria ? criteriaText : "",
        checks: result.lines.filter((l) => l.verdict === "check"),
      }),
    [
      posting,
      now,
      purpose,
      experience,
      useCriteria,
      criteriaText,
      result.lines,
    ],
  );
  const copied =
    copy.state !== "idle" && copy.text === prompt.text ? copy.state : "idle";

  const doCopy = async () => {
    try {
      if (s.demo.failures.clipboard) throw new Error("clipboard denied");
      await navigator.clipboard.writeText(prompt.text);
      setCopy({ state: "done", text: prompt.text });
    } catch {
      setCopy({ state: "failed", text: prompt.text });
      requestAnimationFrame(() => manual.current?.select());
    }
  };

  // 교육 안내는 사용자가 AI로 실제 업무 경험을 만들고 싶다는 맥락이 있을 때만 보조로 보여준다 (§3.5, §12).
  const aiContext = /AI|인공지능/.test(
    `${experience} ${s.session.messages.map((m) => (m.role === "user" ? m.text : "")).join(" ")}`,
  );
  const unknowns =
    prompt.sections.find((x) => x.label.startsWith("미확인"))?.items ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={closed ? "유사 기회 준비에 활용" : "이 공고 준비하기"}
      eyebrow={`${posting.company} · ${posting.title}`}
      className="sheet-prepare"
      footer={
        copied === "done" ? (
          <div className="copy-done" role="status">
            <p className="copy-done-msg">
              <Check />
              복사했어요. 원하는 AI 대화창에 붙여넣어 준비를 시작하세요.
            </p>
            <div className="copy-done-actions">
              <a
                className="btn-secondary"
                href={`/demo/original/${posting.sources[0].ref}`}
                target="_blank"
                rel="noreferrer"
              >
                원문에서 확인 <ArrowUpRight width={15} height={15} />
              </a>
              <button type="button" className="text-btn" onClick={doCopy}>
                다시 복사
              </button>
            </div>
            {aiContext && (
              <aside className="edu">
                <p>AI로 실제 업무 경험까지 만들어보고 싶다면</p>
                <Link
                  href="/demo/education?from=hr&placement=prepare_success"
                  target="_blank"
                >
                  CREAI+IT Foundation Education 살펴보기{" "}
                  <ArrowUpRight width={14} height={14} />
                </Link>
              </aside>
            )}
          </div>
        ) : (
          <button type="button" className="btn-primary wide" onClick={doCopy}>
            <Copy />
            프롬프트 복사
          </button>
        )
      }
    >
      <ol className="steps">
        <li className="step">
          <h3 className="step-title">무엇부터 준비할까요?</h3>
          <div className="purposes" role="radiogroup" aria-label="준비 목적">
            {PURPOSES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={purpose === x.id}
                className="purpose"
                onClick={() => setPurpose(x.id)}
                data-autofocus={purpose === x.id ? true : undefined}
              >
                <b>{x.title}</b>
                <span>{x.detail}</span>
              </button>
            ))}
          </div>
        </li>

        <li className="step">
          <h3 className="step-title">함께 전달할 내 경험</h3>
          {sessionExperience && (
            <label className="consent">
              <input
                type="checkbox"
                checked={useSession}
                onChange={(e) => setUseSession(e.target.checked)}
              />
              <span>
                <b>탐색 중 말한 경험 포함하기</b>
                <q>{sessionExperience}</q>
              </span>
            </label>
          )}
          <textarea
            className="textarea"
            rows={2}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="새로 적어도 돼요. 예: 수업 프로젝트에서 SQL로 고객 구매 데이터를 분석했어요."
            aria-label="함께 전달할 경험"
          />
          {criteriaText && (
            <label className="consent">
              <input
                type="checkbox"
                checked={useCriteria}
                onChange={(e) => setUseCriteria(e.target.checked)}
              />
              <span>
                <b>내 탐색 조건 포함하기</b>
                <q>{criteriaText}</q>
              </span>
            </label>
          )}
          <p className="form-note">
            <Info width={14} height={14} />
            비워두면 외부 AI가 질문부터 시작해요. 고르지 않은 내용은 넣지
            않아요.
          </p>
        </li>

        <li className="step">
          <h3 className="step-title">전달할 내용 확인</h3>
          <dl className="preview">
            <div>
              <dt>공고</dt>
              <dd>
                {posting.company} / {posting.title} · 출처{" "}
                {posting.sources.map((x) => x.name).join(", ")}
              </dd>
            </div>
            <div>
              <dt>업무·요건</dt>
              <dd>
                업무 {posting.tasks.length}개 · 필수 {posting.required.length}개
                · 우대 {posting.preferred.length}개
              </dd>
            </div>
            <div>
              <dt>미확인</dt>
              <dd>{unknowns.length ? unknowns.join(" / ") : "없음"}</dd>
            </div>
            <div>
              <dt>내 맥락</dt>
              <dd className={experience || useCriteria ? "" : "is-empty"}>
                {experience || useCriteria
                  ? [experience && "경험", useCriteria && "탐색 조건"]
                      .filter(Boolean)
                      .join(" · ") + " 포함"
                  : "미제공 — 외부 AI가 먼저 질문해요"}
              </dd>
            </div>
          </dl>
          {posting.bodyNote && (
            <p className="form-note">이미지로 된 본문 일부는 넣지 않았어요.</p>
          )}
          <button
            type="button"
            className="text-btn strong"
            aria-expanded={showFull}
            onClick={() => setShowFull(!showFull)}
          >
            {showFull ? "전체 프롬프트 접기" : "전체 프롬프트 보기"}
          </button>
          {showFull && copied !== "failed" && (
            <pre className="prompt-text">{prompt.text}</pre>
          )}
          {copied === "failed" && (
            <div className="copy-failed" role="alert">
              <p>
                자동 복사가 되지 않았어요. 아래 내용을 선택해 복사해 주세요.
              </p>
              <textarea
                ref={manual}
                className="prompt-text"
                readOnly
                value={prompt.text}
                rows={12}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
        </li>
      </ol>
    </Sheet>
  );
}
