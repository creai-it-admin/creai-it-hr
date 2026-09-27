"use client";

import { useEffect, useRef, useState } from "react";
import {
  criteriaItems,
  type Criteria,
  type Field,
  type Strength,
} from "../_demo/match";
import {
  removeCriterion,
  resolveProposal,
  setStrength,
  undoReceipt,
  useApp,
  type Message,
} from "../_demo/store";
import { Check, Chevron, Sliders } from "./icons";

function Chip({
  field,
  index,
  label,
  strength,
}: {
  field: Field;
  index?: number;
  label: string;
  strength: Strength;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="chip-wrap" ref={root}>
      <button
        type="button"
        className={`chip chip-${strength}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="sr-only">
          {strength === "must" ? "꼭 맞아야 하는 조건" : "있으면 좋은 조건"}
          :{" "}
        </span>
        {label}
        <Chevron width={14} height={14} />
      </button>
      {open && (
        <div className="chip-menu" role="menu">
          <button
            role="menuitemradio"
            aria-checked={strength === "must"}
            onClick={pick(() => setStrength(field, "must", index))}
          >
            {strength === "must" && <Check width={14} height={14} />}꼭 맞아야
            해요
          </button>
          <button
            role="menuitemradio"
            aria-checked={strength === "nice"}
            onClick={pick(() => setStrength(field, "nice", index))}
          >
            {strength === "nice" && <Check width={14} height={14} />}있으면
            좋아요
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={pick(() => removeCriterion(field, label, index))}
          >
            조건 빼기
          </button>
        </div>
      )}
    </div>
  );
}

/** 탐색 조건을 "꼭 / 있으면 좋아요" 두 줄로 보여준다. 대화와 필터가 같은 이 상태를 고친다. */
export function CriteriaLedger({
  criteria,
  onEdit,
  compact,
}: {
  criteria: Criteria;
  onEdit: () => void;
  compact?: boolean;
}) {
  const { session } = useApp();
  const items = criteriaItems(criteria);
  const musts = items.filter((i) => i.strength === "must");
  const nices = items.filter((i) => i.strength === "nice");
  const proposal = [...session.messages]
    .reverse()
    .find(
      (m): m is Extract<Message, { role: "assistant" }> =>
        m.role === "assistant" && Boolean(m.proposal && !m.proposal.resolved),
    );

  return (
    <div className={`criteria ${compact ? "is-compact" : ""}`}>
      {items.length === 0 ? (
        <p className="criteria-empty">
          아직 정한 조건이 없어요. 도우미에게 말하거나 조건 편집으로 기준을
          정하세요.
        </p>
      ) : (
        <dl className="criteria-rows">
          {musts.length > 0 && (
            <div className="criteria-row">
              <dt>꼭 맞아야 해요</dt>
              <dd>
                {musts.map((i) => (
                  <Chip key={`${i.field}${i.index ?? ""}`} {...i} />
                ))}
              </dd>
            </div>
          )}
          {nices.length > 0 && (
            <div className="criteria-row">
              <dt>있으면 좋아요</dt>
              <dd>
                {nices.map((i) => (
                  <Chip key={`${i.field}${i.index ?? ""}`} {...i} />
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
      {proposal?.proposal && (
        <div className="criteria-row is-proposal">
          <dt>제안</dt>
          <dd>
            <span className="chip chip-proposal">
              {proposal.proposal.value}
            </span>
            <button
              type="button"
              className="text-btn strong"
              onClick={() => resolveProposal(proposal.id, true)}
            >
              이 조건 적용
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => resolveProposal(proposal.id, false)}
            >
              {proposal.proposal.keep}
            </button>
          </dd>
        </div>
      )}
      <button
        type="button"
        className="btn-ghost criteria-edit"
        onClick={onEdit}
      >
        <Sliders />
        조건 편집
      </button>
    </div>
  );
}

export function ReceiptLine() {
  const { session, pending } = useApp();
  const r = session.receipt;
  return (
    <div className="receipt-slot" aria-live="polite">
      {pending ? (
        <p className="receipt is-pending">
          <span className="pulse" aria-hidden />
          말씀하신 조건으로 공고를 찾고 있어요. 지금 목록은 그대로 둘게요.
        </p>
      ) : r ? (
        <p className="receipt" key={r.id}>
          <Check width={15} height={15} />
          {r.text}
          <button type="button" className="text-btn" onClick={undoReceipt}>
            되돌리기
          </button>
        </p>
      ) : null}
    </div>
  );
}
