"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Close } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])';

/** 데스크톱에서는 옆 패널, 모바일에서는 전체 높이 시트. 포커스를 안으로 옮기고 닫으면 연 버튼으로 돌려준다. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    (
      el?.querySelector<HTMLElement>("[data-autofocus]") ??
      el?.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("has-sheet");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("has-sheet");
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sheet-head">
          <div>
            {eyebrow && <div className="sheet-eyebrow">{eyebrow}</div>}
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="닫기"
          >
            <Close />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}
