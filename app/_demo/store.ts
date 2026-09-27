"use client";
// 목업 상태. 유지 범위는 experience-design.md §9를 따른다.
// - 세션(sessionStorage): 탐색 조건·대화·경험·비교 후보·숨김
// - 이 브라우저(localStorage): 저장 공고 ID와 마지막으로 확인한 버전, 사용자가 켠 조건 기억
import { useMemo, useSyncExternalStore } from "react";
import { demoNow, findPosting, getPostings, type Variant } from "./fixtures";
import {
  interpret,
  receiptText,
  type Proposal,
  type Question,
} from "./interpret";
import {
  EMPTY_CRITERIA,
  EMPTY_EXPERIENCE,
  exploreResults,
  type Criteria,
  type Experience,
  type Field,
  type Sort,
  type Strength,
} from "./match";

export type Message =
  | {
      id: number;
      role: "user";
      text: string;
      dropped?: "canceled" | "superseded";
    }
  | {
      id: number;
      role: "assistant";
      lines: string[];
      question?: Question;
      proposal?: Proposal & { resolved?: "accepted" | "kept" };
      counts?: { match: number; check: number };
      error?: { retry: string };
    };

export type Receipt = { id: number; text: string; prev: Criteria };
export type Toast = {
  id: number;
  text: string;
  tone?: "error";
  action?: { label: string; run: () => void };
};
export type Saved = { id: string; savedAt: string; seenVersion: number };
export type Failures = {
  ai: boolean;
  clipboard: boolean;
  storage: boolean;
  slow: boolean;
};
export type Origin = "explore" | "saved" | "home" | "compare";

type Session = {
  criteria: Criteria;
  experience: Experience;
  messages: Message[];
  questionsAsked: number;
  receipt: Receipt | null;
  hidden: string[];
  compare: string[];
  sort: Sort | null;
  searched: boolean;
  draft: string;
  homeDraft: string;
  origin: Origin | null;
  prepareFor: string | null;
  assistantOpen: boolean;
  seenIntro: boolean;
};
type Local = {
  saved: Saved[];
  savedOnce: boolean;
  remember: boolean;
  remembered: Criteria | null;
};
type Demo = {
  variants: Variant[];
  failures: Failures;
  scenario: string | null;
};
export type State = {
  session: Session;
  local: Local;
  demo: Demo;
  pending: { id: number; text: string } | null;
  toasts: Toast[];
};

const SESSION: Session = {
  criteria: EMPTY_CRITERIA,
  experience: EMPTY_EXPERIENCE,
  messages: [],
  questionsAsked: 0,
  receipt: null,
  hidden: [],
  compare: [],
  sort: null,
  searched: false,
  draft: "",
  homeDraft: "",
  origin: null,
  prepareFor: null,
  assistantOpen: true,
  seenIntro: false,
};
const LOCAL: Local = {
  saved: [],
  savedOnce: false,
  remember: false,
  remembered: null,
};
const DEMO: Demo = {
  variants: [],
  failures: { ai: false, clipboard: false, storage: false, slow: false },
  scenario: null,
};
const INITIAL: State = {
  session: SESSION,
  local: LOCAL,
  demo: DEMO,
  pending: null,
  toasts: [],
};

const KEYS = {
  session: "creaiit-hr:session",
  local: "creaiit-hr:local",
  demo: "creaiit-hr:demo",
};

let state = INITIAL;
let loaded = false;
let seq = 1;
const listeners = new Set<() => void>();

function read<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const local = read(() => localStorage, KEYS.local, LOCAL);
  const session = read(() => sessionStorage, KEYS.session, SESSION);
  if (!session.searched && local.remember && local.remembered)
    session.criteria = local.remembered;
  state = {
    ...INITIAL,
    session,
    local,
    demo: read(() => sessionStorage, KEYS.demo, DEMO),
  };
  seq = Math.max(seq, ...session.messages.map((m) => m.id + 1));
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막힌 환경(시크릿 창 등)에서도 화면은 동작한다.
  }
}

function set(update: (s: State) => State) {
  ensureLoaded();
  const prev = state;
  state = update(state);
  if (state.session !== prev.session)
    write(() => sessionStorage, KEYS.session, state.session);
  if (state.local !== prev.local)
    write(() => localStorage, KEYS.local, state.local);
  if (state.demo !== prev.demo)
    write(() => sessionStorage, KEYS.demo, state.demo);
  listeners.forEach((l) => l());
}

const session = (patch: Partial<Session>) =>
  set((s) => ({ ...s, session: { ...s.session, ...patch } }));

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() {
  ensureLoaded();
  return state;
}
const getServerSnapshot = () => INITIAL;
const noop = () => () => {};

export function useApp() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
export function useWorld() {
  const s = useApp();
  const variants = s.demo.variants;
  const postings = useMemo(() => getPostings(variants), [variants]);
  return { s, postings, now: demoNow(variants) };
}

function world() {
  return {
    postings: getPostings(state.demo.variants),
    now: demoNow(state.demo.variants),
  };
}

function counts(criteria: Criteria, experience: Experience) {
  const { postings, now } = world();
  const r = exploreResults(postings, criteria, experience, now, {
    hidden: state.session.hidden,
    coverageLimited: state.demo.variants.includes("V5"),
    sort: "relevance",
  });
  return { match: r.match.length, check: r.check.length };
}

// ── 토스트 ─────────────────────────────────────────────
export function toast(text: string, opts: Omit<Toast, "id" | "text"> = {}) {
  const id = seq++;
  set((s) => ({
    ...s,
    toasts: [...s.toasts.slice(-2), { id, text, ...opts }],
  }));
  setTimeout(() => dismissToast(id), opts.action ? 6000 : 3500);
}
export function dismissToast(id: number) {
  set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
}

// ── 탐색 조건 ──────────────────────────────────────────
export function applyCriteria(next: Criteria, text: string) {
  const id = seq++;
  set((s) => ({
    ...s,
    session: {
      ...s.session,
      criteria: next,
      searched: true,
      receipt: { id, text, prev: s.session.criteria },
    },
    local: s.local.remember ? { ...s.local, remembered: next } : s.local,
  }));
}
export function undoReceipt() {
  const r = state.session.receipt;
  if (!r) return;
  session({ criteria: r.prev, receipt: null });
}
export function setStrength(field: Field, strength: Strength, index = 0) {
  const c = state.session.criteria;
  const next: Criteria =
    field === "jobs"
      ? {
          ...c,
          jobs: c.jobs.map((j, i) => (i === index ? { ...j, strength } : j)),
        }
      : { ...c, [field]: { ...(c[field] as object), strength } };
  applyCriteria(
    next,
    strength === "must"
      ? "꼭 맞아야 할 조건으로 바꿨어요"
      : "있으면 좋은 조건으로 바꿨어요",
  );
}
export function removeCriterion(field: Field, label: string, index = 0) {
  const c = state.session.criteria;
  const next: Criteria =
    field === "jobs"
      ? { ...c, jobs: c.jobs.filter((_, i) => i !== index) }
      : { ...c, [field]: undefined };
  applyCriteria(next, `${label} 조건을 뺐어요`);
}
export function setSort(sort: Sort) {
  session({ sort });
}
export function setExperience(experience: Experience) {
  session({ experience });
}
export function setSkill(skill: string, value: boolean) {
  const e = state.session.experience;
  session({ experience: { ...e, skills: { ...e.skills, [skill]: value } } });
  toast(
    value ? `${skill} 경험을 반영했어요` : `${skill} 경험이 없다고 반영했어요`,
  );
}
export function clearSkill(skill: string) {
  const e = state.session.experience;
  const skills = { ...e.skills };
  delete skills[skill];
  session({ experience: { ...e, skills } });
}
export function setRemember(remember: boolean) {
  set((s) => ({
    ...s,
    local: {
      ...s.local,
      remember,
      remembered: remember ? s.session.criteria : null,
    },
  }));
}

/** S00에서 새 탐색 시작. 경험과 비교 후보는 세션에 남긴다. */
export function startSearch(text: string, filters: Criteria) {
  session({
    criteria: filters,
    messages: [],
    questionsAsked: 0,
    receipt: null,
    hidden: [],
    sort: null,
    searched: true,
    homeDraft: "",
    seenIntro: true,
  });
  if (state.local.remember)
    set((s) => ({ ...s, local: { ...s.local, remembered: filters } }));
  if (text.trim()) ask(text);
}

// ── 탐색 도우미 ────────────────────────────────────────
export function setDraft(draft: string) {
  session({ draft });
}
export function setHomeDraft(homeDraft: string) {
  session({ homeDraft });
}

export function ask(raw: string) {
  const text = raw.trim();
  if (!text) return;
  const id = seq++;
  const previous = state.pending;
  set((s) => ({
    ...s,
    pending: { id, text },
    session: {
      ...s.session,
      draft: "",
      searched: true,
      messages: [
        ...s.session.messages.map((m) =>
          previous && m.id === previous.id && m.role === "user"
            ? { ...m, dropped: "superseded" as const }
            : m,
        ),
        { id, role: "user", text },
      ],
    },
  }));
  setTimeout(() => resolveAsk(id, text), state.demo.failures.slow ? 2600 : 650);
}

function resolveAsk(id: number, text: string) {
  if (state.pending?.id !== id) return;
  const s = state.session;
  if (state.demo.failures.ai) {
    set((st) => ({
      ...st,
      pending: null,
      session: {
        ...st.session,
        draft: text,
        messages: [
          ...st.session.messages,
          {
            id: seq++,
            role: "assistant",
            lines: [
              "지금은 AI 조건 정리를 사용할 수 없어요. 입력한 내용은 그대로 두었어요.",
            ],
            error: { retry: text },
          },
        ],
      },
    }));
    return;
  }
  const firstTurn = !s.messages.some((m) => m.role === "assistant" && !m.error);
  const r = interpret(text, s.criteria, s.experience, {
    questionsAsked: s.questionsAsked,
    firstTurn,
  });
  const changed = JSON.stringify(r.criteria) !== JSON.stringify(s.criteria);
  const receipt = changed
    ? {
        id,
        text: receiptText(r.changes) ?? "조건을 바꿨어요",
        prev: s.criteria,
      }
    : s.receipt;
  set((st) => ({
    ...st,
    pending: null,
    session: {
      ...st.session,
      criteria: r.criteria,
      experience: r.experience,
      receipt,
      questionsAsked: r.question ? st.session.questionsAsked + 1 : 0,
      messages: [
        ...st.session.messages,
        {
          id: seq++,
          role: "assistant",
          lines: r.reply,
          question: r.question,
          proposal: r.proposal,
          counts: changed ? counts(r.criteria, r.experience) : undefined,
        },
      ],
    },
    local:
      st.local.remember && changed
        ? { ...st.local, remembered: r.criteria }
        : st.local,
  }));
}

export function cancelPending() {
  const p = state.pending;
  if (!p) return;
  set((s) => ({
    ...s,
    pending: null,
    session: {
      ...s.session,
      draft: p.text,
      messages: s.session.messages.map((m) =>
        m.id === p.id && m.role === "user"
          ? { ...m, dropped: "canceled" as const }
          : m,
      ),
    },
  }));
}

export function resolveProposal(messageId: number, accept: boolean) {
  const m = state.session.messages.find((x) => x.id === messageId);
  if (!m || m.role !== "assistant" || !m.proposal || m.proposal.resolved)
    return;
  const proposal = m.proposal;
  set((s) => ({
    ...s,
    session: {
      ...s.session,
      messages: s.session.messages.map((x) =>
        x.id === messageId && x.role === "assistant"
          ? {
              ...x,
              proposal: { ...proposal, resolved: accept ? "accepted" : "kept" },
            }
          : x,
      ),
    },
  }));
  if (accept)
    applyCriteria(proposal.apply, `${proposal.value} 조건으로 바꿨어요`);
}

export function setAssistantOpen(assistantOpen: boolean) {
  session({ assistantOpen });
}

// ── 저장 · 비교 · 숨기기 ───────────────────────────────
export function isSaved(s: State, id: string) {
  return s.local.saved.some((x) => x.id === id);
}

export function toggleSave(id: string) {
  const existing = state.local.saved.find((x) => x.id === id);
  if (existing) {
    removeSaved(id);
    return;
  }
  if (state.demo.failures.storage) {
    toast("이 브라우저에 저장하지 못했어요. 공고 링크를 복사해 두세요.", {
      tone: "error",
    });
    return;
  }
  const { postings, now } = world();
  const p = findPosting(postings, id);
  const first = !state.local.savedOnce;
  set((s) => ({
    ...s,
    local: {
      ...s.local,
      savedOnce: true,
      saved: [
        ...s.local.saved,
        { id, savedAt: now, seenVersion: p?.version ?? 1 },
      ],
    },
  }));
  toast(
    first
      ? "이 브라우저에 저장했어요. 다른 기기나 시크릿 창에는 이어지지 않아요."
      : "저장했어요",
  );
}

export function removeSaved(id: string) {
  const before = state.local.saved;
  set((s) => ({
    ...s,
    local: { ...s.local, saved: s.local.saved.filter((x) => x.id !== id) },
  }));
  toast("저장한 공고에서 뺐어요", {
    action: {
      label: "되돌리기",
      run: () => set((s) => ({ ...s, local: { ...s.local, saved: before } })),
    },
  });
}

export function acknowledge(id: string, version: number) {
  set((s) => ({
    ...s,
    local: {
      ...s.local,
      saved: s.local.saved.map((x) =>
        x.id === id ? { ...x, seenVersion: version } : x,
      ),
    },
  }));
}

export function clearLocal() {
  set((s) => ({ ...s, local: LOCAL, session: { ...s.session, compare: [] } }));
  toast("이 브라우저의 기록을 지웠어요");
}

export function toggleCompare(id: string) {
  const list = state.session.compare;
  if (list.includes(id))
    return session({ compare: list.filter((x) => x !== id) });
  if (list.length >= 3) {
    toast("최대 3개를 비교할 수 있어요. 먼저 하나를 빼 주세요.");
    return;
  }
  session({ compare: [...list, id] });
}
export function clearCompare() {
  session({ compare: [] });
}

export function hide(id: string) {
  session({
    hidden: [...state.session.hidden, id],
    compare: state.session.compare.filter((x) => x !== id),
  });
  toast("이번 탐색에서 숨겼어요", {
    action: { label: "되돌리기", run: () => unhide(id) },
  });
}
export function unhide(id: string) {
  session({ hidden: state.session.hidden.filter((x) => x !== id) });
}

export function setOrigin(origin: Origin | null) {
  if (state.session.origin !== origin) session({ origin });
}
export function openPrepareOn(id: string | null) {
  session({ prepareFor: id });
}
export function markIntroSeen() {
  if (!state.session.seenIntro) session({ seenIntro: true });
}

// ── 시연 도구 ──────────────────────────────────────────
export function toggleVariant(v: Variant) {
  set((s) => ({
    ...s,
    demo: {
      ...s.demo,
      variants: s.demo.variants.includes(v)
        ? s.demo.variants.filter((x) => x !== v)
        : [...s.demo.variants, v].sort(),
    },
  }));
}
export function toggleFailure(key: keyof Failures) {
  set((s) => ({
    ...s,
    demo: {
      ...s.demo,
      failures: { ...s.demo.failures, [key]: !s.demo.failures[key] },
    },
  }));
}

export type ScenarioId = "D1" | "D2" | "D3" | "D4" | "D5";

const SCENARIO_TEXT: Partial<Record<ScenarioId, string>> = {
  D1: "수업에서 산업 자료를 조사하고 정리해봤어요. 서울에서 리서치 경험을 쌓을 인턴을 찾고 있어요.",
  D3: "서울에서 제품 운영 경력 3년을 살릴 일을 보고 있어요. 연봉 5천 이상과 주 2일 재택은 꼭 필요해요.",
  D4: "영업 운영을 1년 했고 Excel과 CRM으로 고객 데이터를 정리했어요. 데이터 쪽 업무로 옮겨보고 싶어요.",
};

/** 시나리오 시작 상태를 만들고 이동할 경로를 돌려준다. */
export function runScenario(id: ScenarioId) {
  const failures = { ...DEMO.failures };
  if (id === "D5") {
    set((s) => ({
      ...s,
      pending: null,
      toasts: [],
      demo: { variants: ["V1", "V2"], failures, scenario: "재방문 시연" },
      local: {
        ...LOCAL,
        savedOnce: true,
        saved: [
          { id: "F01", savedAt: "2026-10-06T09:30:00+09:00", seenVersion: 1 },
          { id: "F03", savedAt: "2026-10-06T09:40:00+09:00", seenVersion: 1 },
        ],
      },
      session: {
        ...SESSION,
        searched: true,
        seenIntro: true,
        experience: {
          text: "수업에서 산업 자료를 조사하고 정리해봤어요.",
          skills: { "자료 정리": true },
        },
        criteria: {
          region: { value: "서울", strength: "must" },
          employment: { value: "인턴", strength: "must" },
          workDays: { value: 3, strength: "must" },
          jobs: [{ value: "리서치", strength: "must" }],
        },
      },
    }));
    return "/saved";
  }
  set((s) => ({
    ...s,
    pending: null,
    toasts: [],
    demo: { variants: [], failures, scenario: `${id} 시연` },
    local: LOCAL,
    session: { ...SESSION, homeDraft: SCENARIO_TEXT[id] ?? "" },
  }));
  return "/";
}

export function resetDemo() {
  set(() => ({ ...INITIAL }));
  try {
    sessionStorage.removeItem(KEYS.session);
    sessionStorage.removeItem(KEYS.demo);
    localStorage.removeItem(KEYS.local);
  } catch {
    // 무시
  }
}
