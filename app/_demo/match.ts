// 목업의 조건 대조. 판단 순서(experience-design.md §7):
// 검토 가능한 상태인가 → 알려진 필수 불일치 → 미확인 조건 → 선호·목표와의 연결.
import {
  availability,
  payConflict,
  type Availability,
  type Posting,
} from "./fixtures";
import { josa, won } from "./format";

export type Strength = "must" | "nice";
export type Criterion<T> = { value: T; strength: Strength };
export type Career = { kind: "entry" } | { kind: "experienced"; years: number };

export type Criteria = {
  jobs: Criterion<string>[];
  region?: Criterion<string>;
  employment?: Criterion<"인턴" | "정규직">;
  career?: Criterion<Career>;
  workDays?: Criterion<number>;
  remote?: Criterion<number>;
  salary?: Criterion<number>;
  startMonth?: Criterion<number>;
};

export type Experience = {
  text: string;
  skills: Record<string, boolean>;
  career?: { field: string; years: number };
};

export const EMPTY_CRITERIA: Criteria = { jobs: [] };
export const EMPTY_EXPERIENCE: Experience = { text: "", skills: {} };

export type Verdict = "match" | "check" | "mismatch";
export type Line = {
  key: string;
  label: string;
  strength: Strength | "required";
  verdict: Verdict;
  /** 사용자가 준 기준·정보 */
  mine: string;
  /** 공고에 적힌 내용 */
  theirs: string;
  note: string;
  /** 확인이 필요한 쪽: 공고에 값이 없는지, 내 정보가 없는지 */
  about: "posting" | "me";
  ev?: string;
  skill?: string;
};

export type Group = "match" | "check" | "status" | "excluded" | "closed";
export type Evaluation = {
  posting: Posting;
  availability: Availability;
  lines: Line[];
  group: Group;
  score: number;
  reasons: string[];
  check: Line | null;
};

export const hasCriteria = (c: Criteria) =>
  c.jobs.length > 0 ||
  Boolean(
    c.region ||
    c.employment ||
    c.career ||
    c.workDays ||
    c.remote ||
    c.salary ||
    c.startMonth,
  );
export const hasExperience = (e: Experience) =>
  e.text.trim().length > 0 ||
  Object.keys(e.skills).length > 0 ||
  Boolean(e.career);

export function careerLabel(c: Career) {
  return c.kind === "entry" ? "신입" : `경력 ${c.years}년`;
}

/** 칩과 요약에 쓰는 조건 이름 */
export function criteriaItems(c: Criteria) {
  const items: {
    field: Field;
    index?: number;
    label: string;
    strength: Strength;
  }[] = [];
  if (c.region)
    items.push({
      field: "region",
      label: c.region.value,
      strength: c.region.strength,
    });
  if (c.employment)
    items.push({
      field: "employment",
      label: c.employment.value,
      strength: c.employment.strength,
    });
  if (c.career)
    items.push({
      field: "career",
      label: careerLabel(c.career.value),
      strength: c.career.strength,
    });
  if (c.workDays)
    items.push({
      field: "workDays",
      label: `주 ${c.workDays.value}일 근무`,
      strength: c.workDays.strength,
    });
  if (c.remote)
    items.push({
      field: "remote",
      label: `주 ${c.remote.value}일 재택`,
      strength: c.remote.strength,
    });
  if (c.salary)
    items.push({
      field: "salary",
      label: `연봉 ${won(c.salary.value)} 이상`,
      strength: c.salary.strength,
    });
  if (c.startMonth)
    items.push({
      field: "startMonth",
      label: `${c.startMonth.value}월부터 시작`,
      strength: c.startMonth.strength,
    });
  c.jobs.forEach((j, index) =>
    items.push({
      field: "jobs",
      index,
      label: `${j.value} 업무`,
      strength: j.strength,
    }),
  );
  return items;
}
export type Field =
  | "region"
  | "employment"
  | "career"
  | "workDays"
  | "remote"
  | "salary"
  | "startMonth"
  | "jobs";

const LOGISTICS = [
  "region",
  "employment",
  "career",
  "workDays",
  "remote",
  "salary",
  "startMonth",
];

function annual(pay: Posting["pay"]) {
  if (pay.kind === "unknown") return null;
  const k = pay.kind === "monthly" ? 12 : 1;
  return {
    min: pay.min * k,
    max: pay.max === undefined ? undefined : pay.max * k,
  };
}

export function evaluate(
  p: Posting,
  c: Criteria,
  e: Experience,
  now: string,
): Evaluation {
  const avail = availability(p, now);
  const lines: Line[] = [];
  const add = (l: Line) => lines.push(l);
  const personal = hasCriteria(c) || hasExperience(e);

  if (personal) {
    if (c.region) {
      const mine = c.region.value;
      const base = {
        key: "region",
        label: "지역",
        strength: c.region.strength,
        mine,
        about: "posting" as const,
        ev: p.evidence.region,
      };
      if (!p.region)
        add({
          ...base,
          verdict: "check",
          theirs: "공고에 없음",
          note: "근무지가 공고에 없어요",
        });
      else
        add({
          ...base,
          verdict: p.region === mine ? "match" : "mismatch",
          theirs: `근무지 ${p.region}`,
          note: `근무지가 ${josa(p.region, "이에요", "예요")}`,
        });
    }

    if (c.employment) {
      const base = {
        key: "employment",
        label: "고용 형태",
        strength: c.employment.strength,
        mine: c.employment.value,
        about: "posting" as const,
        ev: p.evidence.employment,
      };
      if (!p.employment)
        add({
          ...base,
          verdict: "check",
          theirs: "공고에 없음",
          note: "고용 형태가 공고에 없어요",
        });
      else
        add({
          ...base,
          verdict: p.employment === c.employment.value ? "match" : "mismatch",
          theirs: `${p.employment} 채용`,
          note: `${p.employment} 채용이에요`,
        });
    }

    if (c.career) {
      const want = c.career.value;
      const base = {
        key: "career",
        label: "경력",
        strength: c.career.strength,
        mine: careerLabel(want),
        about: "posting" as const,
        ev: p.evidence.career,
      };
      const pc = p.career;
      if (!pc)
        add({
          ...base,
          verdict: "check",
          theirs: "공고에 없음",
          note: "경력 조건이 공고에 없어요",
        });
      else {
        let verdict: Verdict;
        let note = `공고에는 ‘${pc.text}’로 적혀 있어요`;
        if (want.kind === "entry")
          verdict = pc.level === "experienced" ? "mismatch" : "match";
        else if (pc.level === "entry") {
          verdict = "mismatch";
          note = "신입 대상 공고예요";
        } else if (pc.level === "any") {
          verdict = p.employment === "인턴" ? "mismatch" : "match";
          if (p.employment === "인턴") note = "인턴 공고예요";
        } else
          verdict =
            (pc.min ?? 0) <= want.years && want.years <= (pc.max ?? Infinity)
              ? "match"
              : "mismatch";
        add({ ...base, verdict, theirs: pc.text, note });
      }
    }

    if (c.workDays) {
      const n = c.workDays.value;
      const base = {
        key: "workDays",
        label: "근무일",
        strength: c.workDays.strength,
        mine: `주 ${n}일 가능`,
        about: "posting" as const,
        ev: p.evidence.workDays,
      };
      if (p.workDays === null)
        add({
          ...base,
          verdict: "check",
          theirs: "공고에 없음",
          note: `주 ${n}일 근무 가능 여부는 공고에 없어요`,
        });
      else
        add({
          ...base,
          verdict: p.workDays <= n ? "match" : "mismatch",
          theirs: `주 ${p.workDays}일 근무`,
          note: `주 ${p.workDays}일 근무로 적혀 있어요`,
        });
    }

    if (c.remote) {
      const n = c.remote.value;
      const base = {
        key: "remote",
        label: "재택",
        strength: c.remote.strength,
        mine: `주 ${n}일 재택`,
        about: "posting" as const,
        ev: p.evidence.remote,
      };
      if (p.remoteDays === null)
        add({
          ...base,
          verdict: "check",
          theirs: p.remoteText ?? "공고에 없음",
          note: p.remoteText
            ? `재택은 ‘${p.remoteText.replace(/^재택\s*/, "")}’로만 적혀 있어요`
            : "재택 여부가 공고에 없어요",
        });
      else
        add({
          ...base,
          verdict: p.remoteDays >= n ? "match" : "mismatch",
          theirs: p.remoteText ?? `주 ${p.remoteDays}일 재택`,
          note:
            p.remoteDays === 0
              ? "전일 출근으로 적혀 있어요"
              : `주 ${p.remoteDays}일 재택이 적혀 있어요`,
        });
    }

    if (c.salary) {
      const n = c.salary.value;
      const base = {
        key: "salary",
        label: "보상",
        strength: c.salary.strength,
        mine: `연 ${won(n)} 이상`,
        about: "posting" as const,
        ev: p.evidence.pay,
      };
      const range = annual(p.pay);
      if (payConflict(p))
        add({
          ...base,
          verdict: "check",
          theirs: "출처마다 다름",
          note: "출처마다 연봉이 다르게 적혀 있어요. 원문별로 확인하세요",
        });
      else if (!range)
        add({
          ...base,
          verdict: "check",
          theirs: p.pay.text,
          note:
            p.pay.text === "공고에 없음"
              ? "보상이 공고에 없어요"
              : `보상은 ‘${p.pay.text}’로만 적혀 있어요`,
        });
      else {
        const verdict: Verdict =
          range.min >= n
            ? "match"
            : range.max !== undefined && range.max < n
              ? "mismatch"
              : "check";
        add({
          ...base,
          verdict,
          theirs: p.pay.text,
          note: `${p.pay.text}으로 적혀 있어요`,
        });
      }
    }

    if (c.startMonth) {
      const m = c.startMonth.value;
      const base = {
        key: "startMonth",
        label: "시작 시기",
        strength: c.startMonth.strength,
        mine: `${m}월부터 가능`,
        about: "posting" as const,
        ev: p.evidence.start,
      };
      if (!p.startDate)
        add({
          ...base,
          verdict: "check",
          theirs: p.startText ?? "공고에 없음",
          note: p.startText
            ? `시작은 ‘${p.startText}’로 적혀 있어요`
            : "시작 시기가 공고에 없어요",
        });
      else {
        const pm = Number(p.startDate.slice(5, 7));
        add({
          ...base,
          verdict: pm >= m ? "match" : "mismatch",
          theirs: p.startText ?? p.startDate,
          note: `${p.startText}이에요`,
        });
      }
    }

    c.jobs.forEach((j, i) => {
      const base = {
        key: `job${i}`,
        label: "업무",
        strength: j.strength,
        mine: `${j.value} 업무`,
        about: "posting" as const,
        ev: p.tasks[0]?.ev,
      };
      if (!p.body) {
        add({
          ...base,
          verdict: "check",
          theirs: "본문 미확보",
          note: "업무 내용을 확보하지 못했어요",
        });
        return;
      }
      // 넓은 기준(데이터)은 세부 태그(데이터 분석)를 포함하지만, 세부 기준이 넓은 태그에 맞는다고 보지 않는다.
      const hit = p.tags.some((t) => t.includes(j.value));
      const tasks = p.tasks
        .slice(0, 2)
        .map((t) => t.text)
        .join(" · ");
      if (hit)
        add({
          ...base,
          verdict: "match",
          theirs: tasks,
          note: `${tasks} 업무가 있어요`,
        });
      else if (j.strength === "must")
        add({
          ...base,
          verdict: "mismatch",
          theirs: tasks,
          note: `${j.value} 관련 업무가 적혀 있지 않아요`,
        });
    });

    for (const q of p.required) {
      const base = {
        label: "필수 요건",
        strength: "required" as const,
        theirs: q.label,
        ev: q.ev,
        about: "me" as const,
      };
      if (q.skill) {
        const has = e.skills[q.skill];
        add({
          ...base,
          key: `req:${q.skill}`,
          skill: q.skill,
          verdict:
            has === true ? "match" : has === false ? "mismatch" : "check",
          mine:
            has === true
              ? "입력한 경험에 있음"
              : has === false
                ? "해보지 않았다고 함"
                : "입력하지 않음",
          note:
            has === true
              ? `${josa(q.label, "이", "가")} 필수예요. 입력한 경험에 있어요`
              : has === false
                ? `${josa(q.label, "이", "가")} 필수예요. 아직 해보지 않았다고 했어요`
                : `${josa(q.label, "은", "는")} 공고상 필수예요. 해당 경험은 아직 입력되지 않았어요`,
        });
      } else if (q.career) {
        const mine = e.career
          ? `${e.career.field} ${e.career.years}년`
          : "입력하지 않음";
        const related = e.career
          ? q.career.related.some((r) => e.career!.field.includes(r))
          : false;
        const verdict: Verdict = !e.career
          ? "check"
          : e.career.years < q.career.years
            ? "mismatch"
            : related
              ? "match"
              : "check";
        const note = !e.career
          ? `${josa(q.label, "이", "가")} 필수예요. 경력 정보는 아직 입력되지 않았어요`
          : verdict === "mismatch"
            ? `${josa(q.label, "이", "가")} 필수예요. 입력한 경력은 ${mine}이에요`
            : verdict === "match"
              ? `입력한 ${mine}이 ‘${q.label}’과 연결돼요`
              : `입력한 ${mine}이 같은 업무 경력으로 인정되는지 확인이 필요해요`;
        add({ ...base, key: `req:career`, verdict, mine, note });
      }
    }

    if (
      p.connect &&
      e.text &&
      p.connect.keywords.some((k) => e.text.includes(k))
    )
      add({
        key: "connect",
        label: "내 경험",
        strength: "nice",
        verdict: "match",
        mine: e.text.length > 30 ? `${e.text.slice(0, 30)}…` : e.text,
        theirs: p.tasks
          .slice(0, 2)
          .map((t) => t.text)
          .join(" · "),
        note: p.connect.note,
        about: "me",
        ev: p.tasks[0]?.ev,
      });
  }

  const hard = (l: Line) => l.strength !== "nice";
  let group: Group;
  if (avail === "closed") group = "closed";
  else if (lines.some((l) => hard(l) && l.verdict === "mismatch"))
    group = "excluded";
  else if (avail !== "open") group = "status";
  else if (lines.some((l) => hard(l) && l.verdict === "check")) group = "check";
  else group = "match";

  const score = lines.reduce(
    (s, l) =>
      s +
      (l.verdict === "match"
        ? l.key.startsWith("job")
          ? 3
          : l.key === "connect"
            ? 2
            : 1
        : l.verdict === "check"
          ? -1
          : 0),
    0,
  );

  const logistics = lines.filter(
    (l) => l.verdict === "match" && LOGISTICS.includes(l.key),
  );
  const connect = lines.find((l) => l.key === "connect");
  const job = lines.find(
    (l) => l.verdict === "match" && l.key.startsWith("job"),
  );
  const reasons = [
    logistics.length
      ? `${logistics.map((l) => l.mine.replace(/ 가능$/, "")).join(" · ")} 조건이 공고와 맞아요`
      : null,
    connect?.note ?? job?.note ?? null,
  ].filter((r): r is string => Boolean(r));
  const checks = lines.filter((l) => l.verdict === "check");
  const check =
    checks.find((l) => hard(l) && l.about === "posting") ??
    checks.find(hard) ??
    checks[0] ??
    null;

  return {
    posting: p,
    availability: avail,
    lines,
    group,
    score,
    reasons,
    check,
  };
}

export type Sort = "relevance" | "recent" | "deadline";

const verifiedAt = (p: Posting) => p.status.checkedAt ?? p.listSeenAt ?? "";

export function sortEvaluations(list: Evaluation[], sort: Sort) {
  return [...list].sort((a, b) => {
    if (sort === "deadline") {
      const da = a.posting.deadline ?? "9999";
      const db = b.posting.deadline ?? "9999";
      if (da !== db) return da < db ? -1 : 1;
    }
    if (sort === "relevance" && a.score !== b.score) return b.score - a.score;
    return verifiedAt(b.posting).localeCompare(verifiedAt(a.posting));
  });
}

export function exploreResults(
  postings: Posting[],
  c: Criteria,
  e: Experience,
  now: string,
  opts: { hidden: string[]; coverageLimited: boolean; sort: Sort },
) {
  const personal = hasCriteria(c) || hasExperience(e);
  const pool = opts.coverageLimited
    ? postings.filter((p) => p.career?.level !== "experienced")
    : postings;
  const all = pool.map((p) => evaluate(p, c, e, now));
  const visible = all.filter((r) => !opts.hidden.includes(r.posting.id));
  const by = (g: Group) =>
    sortEvaluations(
      visible.filter((r) => r.group === g),
      opts.sort,
    );
  return {
    personal,
    match: by("match"),
    check: by("check"),
    status: by("status"),
    hidden: all.filter(
      (r) =>
        opts.hidden.includes(r.posting.id) &&
        r.group !== "excluded" &&
        r.group !== "closed",
    ),
    coverage: opts.coverageLimited && c.career?.value.kind === "experienced",
  };
}

/**
 * 확인된 일치가 없을 때 조건 하나를 바꾸면 일치 공고가 생기는지 찾는다 (X03).
 * 제안만 만들고 적용은 사용자가 한다.
 */
export function suggestRelaxation(
  postings: Posting[],
  c: Criteria,
  e: Experience,
  now: string,
) {
  const matched = (next: Criteria) =>
    postings
      .map((p) => evaluate(p, next, e, now))
      .filter((r) => r.group === "match");

  if (c.workDays) {
    const found = postings
      .filter((p) => p.workDays !== null && p.workDays > c.workDays!.value)
      .map((p) => p.workDays!)
      .sort((a, b) => a - b);
    for (const days of found) {
      const next = { ...c, workDays: { ...c.workDays, value: days } };
      const hits = matched(next);
      if (hits.length)
        return {
          text: `주 ${days}일도 검토할까요?`,
          detail: `주 ${days}일로 바꾸면 조건에 맞는 공고 ${hits.length}개가 있어요. 바꾸기 전까지 지금 조건과 결과는 그대로예요.`,
          apply: next,
          label: `주 ${days}일로 변경`,
          receipt: `주 ${days}일 근무 조건을 적용했어요`,
        };
    }
  }
  const drops: [keyof Criteria, string][] = [
    ["region", "지역"],
    ["salary", "연봉"],
    ["remote", "재택"],
    ["employment", "고용 형태"],
    ["career", "경력"],
    ["startMonth", "시작 시기"],
  ];
  for (const [field, name] of drops) {
    if (!c[field]) continue;
    const next = { ...c, [field]: undefined } as Criteria;
    const hits = matched(next);
    if (hits.length)
      return {
        text: `${name} 조건을 빼고 볼까요?`,
        detail: `${name} 조건을 빼면 조건에 맞는 공고 ${hits.length}개가 있어요. 빼기 전까지 지금 조건과 결과는 그대로예요.`,
        apply: next,
        label: `${name} 조건 빼기`,
        receipt: `${name} 조건을 뺐어요`,
      };
  }
  return null;
}
