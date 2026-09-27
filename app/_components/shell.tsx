"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { demoNow, VARIANTS } from "../_demo/fixtures";
import { day } from "../_demo/format";
import {
  clearCompare,
  dismissToast,
  resetDemo,
  runScenario,
  toggleFailure,
  toggleVariant,
  useApp,
  useHydrated,
  type Failures,
  type ScenarioId,
} from "../_demo/store";
import { ArrowRight, ArrowUpRight, Flask } from "./icons";
import { Sheet } from "./sheet";

const SCENARIOS: {
  id: ScenarioId;
  persona: string;
  title: string;
  steps: string[];
}[] = [
  {
    id: "D1",
    persona: "P1 첫 기회 탐색자",
    title: "첫 인턴 탐색 → 확인할 조건 → 경험 정리",
    steps: [
      "예문으로 기회 찾기",
      "도우미 질문에 ‘주 3일만 가능해요’",
      "F02 상세에서 근무일 미기재 확인 → F01 저장",
      "F01 준비하기 → 내 경험 정리하기 → 경험은 포함하지 않고 복사",
    ],
  },
  {
    id: "D2",
    persona: "P2 목표가 명확한 지원자",
    title: "필터 탐색 → 비교 → 지원 전략",
    steps: [
      "필터: 서울·정규직·신입, 업무 데이터 분석",
      "F03·F04 비교 (SQL 필수 vs 우대)",
      "F03 준비 → 지원 전략 → SQL 경험 입력 후 포함 → 복사",
      "원문 확인 후 돌아오기",
    ],
  },
  {
    id: "D3",
    persona: "P3 선택적 이직",
    title: "미확인 조건 → 저장 → 재방문",
    steps: [
      "예문으로 기회 찾기",
      "조건 편집을 열어 확인 후 취소",
      "F06·F07 저장 → 저장한 공고",
      "V3 켜서 확인 지연 보기, V5로 범위 부족 보기",
    ],
  },
  {
    id: "D4",
    persona: "P4 직무 전환",
    title: "경험 연결 → 조건 보완",
    steps: [
      "예문으로 기회 찾기",
      "F03 상세에서 ‘아직 안 써봤어요’",
      "목록에서 F03 제외 확인",
      "F04 → 내 경험 정리하기 → 복사",
    ],
  },
  {
    id: "D5",
    persona: "재방문",
    title: "재방문과 실패 회복",
    steps: [
      "F01 내용 변경·F03 마감 확인 (V1·V2 적용됨)",
      "홈에서 ‘서울에서 주 2일 가능한 리서치 인턴’ → 0건과 제안",
      "‘주 5일로 변경’ 적용",
      "AI 오류·클립보드 거부를 켜고 회복 경로 확인",
    ],
  },
];

const FAILURES: { key: keyof Failures; label: string; detail: string }[] = [
  {
    key: "ai",
    label: "AI 조건 정리 오류",
    detail: "X09 · 대화가 실패해도 필터·원문·복사는 유지",
  },
  {
    key: "clipboard",
    label: "클립보드 거부",
    detail: "X10 · 전체 텍스트를 직접 선택",
  },
  {
    key: "storage",
    label: "브라우저 저장 실패",
    detail: "X11 · 저장 아이콘이 되돌아감",
  },
  {
    key: "slow",
    label: "느린 응답",
    detail: "X01 · X13 · 요청 도중 취소·새 요청",
  },
];

function DemoTools({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useApp();
  const router = useRouter();
  const start = (id: ScenarioId) => {
    const path = runScenario(id);
    onClose();
    router.push(path);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="시연 도구"
      eyebrow="검토 진행자용 · 제품 화면이 아니에요"
      className="sheet-demo"
    >
      <section className="demo-section">
        <h3>시연 시나리오</h3>
        <ul className="scenarios">
          {SCENARIOS.map((x) => (
            <li key={x.id}>
              <div>
                <p className="scenario-id">
                  {x.id} · {x.persona}
                </p>
                <p className="scenario-title">{x.title}</p>
                <ol>
                  {x.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <button
                type="button"
                className="btn-secondary small"
                onClick={() => start(x.id)}
              >
                시작
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="demo-section">
        <h3>재방문·데이터 변형</h3>
        {VARIANTS.map((v) => (
          <label className="toggle-row" key={v.id}>
            <input
              type="checkbox"
              checked={s.demo.variants.includes(v.id)}
              onChange={() => toggleVariant(v.id)}
            />
            <span>
              <b>
                {v.id} {v.title}
              </b>
              <small>{v.detail}</small>
            </span>
          </label>
        ))}
      </section>
      <section className="demo-section">
        <h3>실패 상황</h3>
        {FAILURES.map((f) => (
          <label className="toggle-row" key={f.key}>
            <input
              type="checkbox"
              checked={s.demo.failures[f.key]}
              onChange={() => toggleFailure(f.key)}
            />
            <span>
              <b>{f.label}</b>
              <small>{f.detail}</small>
            </span>
          </label>
        ))}
      </section>
      <button
        type="button"
        className="btn-secondary wide"
        onClick={() => {
          resetDemo();
          onClose();
          router.push("/");
        }}
      >
        시연 초기화
      </button>
    </Sheet>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const s = useApp();
  const hydrated = useHydrated();
  const pathname = usePathname();
  const [tools, setTools] = useState(false);
  const now = demoNow(s.demo.variants);
  const savedCount = hydrated ? s.local.saved.length : 0;
  const active = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/explore")
      : pathname.startsWith(href);

  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="demo-strip" role="note">
        <span className="demo-strip-label">
          <Flask width={14} height={14} />
          샘플 데이터로 보는 UX 목업
        </span>
        <span className="demo-strip-meta">
          기준 시각 {day(now.slice(0, 10))} {now.slice(11, 16)}
          {hydrated && s.demo.scenario && <b> · {s.demo.scenario}</b>}
          {hydrated && s.demo.variants.length > 0 && (
            <b> · {s.demo.variants.join(" ")}</b>
          )}
        </span>
        <button
          type="button"
          className="demo-strip-btn"
          onClick={() => setTools(true)}
        >
          시연 도구
        </button>
      </div>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand" aria-label="CREAI+IT HR 처음으로">
            <span className="brand-symbol">
              <Image
                src="/brand/creaiit-symbol.png"
                alt=""
                width={40}
                height={57}
                priority
              />
            </span>
            <span className="brand-word">
              CREAI<span className="brand-plus">+</span>IT
            </span>
            <span className="brand-product">HR</span>
          </Link>
          <nav className="site-nav" aria-label="주요 메뉴">
            <Link
              href={s.session.searched ? "/explore" : "/"}
              aria-current={active("/") ? "page" : undefined}
              className="nav-find"
            >
              기회 찾기
            </Link>
            <Link
              href="/saved"
              aria-current={active("/saved") ? "page" : undefined}
            >
              저장한 공고
              {savedCount > 0 && <span className="count">{savedCount}</span>}
            </Link>
          </nav>
          <a
            className="site-about"
            href="/demo/education?from=hr&placement=nav"
            target="_blank"
            rel="noreferrer"
          >
            CREAI+IT 소개
            <ArrowUpRight width={14} height={14} />
          </a>
        </div>
      </header>
      <main id="main">{children}</main>
      <div className="toasts" aria-live="polite">
        {s.toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.tone === "error" ? "is-error" : ""}`}
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <DemoTools open={tools} onClose={() => setTools(false)} />
    </>
  );
}

/** 비교 선택이 있을 때만 보인다. 최대 3개. */
export function CompareBar() {
  const s = useApp();
  const n = s.session.compare.length;
  if (!n) return null;
  return (
    <div className="compare-bar" role="region" aria-label="비교 선택">
      <p aria-live="polite">
        <b>{n}개 선택</b>
        <span>
          {n === 1
            ? "비교할 공고를 하나 더 선택하세요"
            : n === 3
              ? "최대 3개까지 비교할 수 있어요"
              : "하나 더 고를 수 있어요"}
        </span>
      </p>
      <button type="button" className="text-btn on-dark" onClick={clearCompare}>
        선택 비우기
      </button>
      {n >= 2 ? (
        <Link href="/compare" className="btn-light">
          비교하기 <ArrowRight width={16} height={16} />
        </Link>
      ) : (
        <span className="btn-light is-disabled" aria-disabled="true">
          비교하기
        </span>
      )}
    </div>
  );
}
