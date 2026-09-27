// 목업의 "탐색 도우미". 실제 모델 대신 정해진 규칙으로 문장을 조건으로 바꾼다.
// 계약: 명시된 조건만 적용하고, 기존 필수 조건을 바꾸는 말은 제안으로만 보여준다 (§6 S01, §7).
import { josa, ro, won } from "./format";
import {
  careerLabel,
  type Career,
  type Criteria,
  type Criterion,
  type Experience,
  type Strength,
} from "./match";

export type Change = { label: string; strength?: Strength; removed?: boolean };
export type Proposal = {
  text: string;
  value: string;
  apply: Criteria;
  accept: string;
  keep: string;
};
export type Question = { text: string; options: string[] };
export type Interpretation = {
  criteria: Criteria;
  experience: Experience;
  changes: Change[];
  reply: string[];
  proposal?: Proposal;
  question?: Question;
  experienceNoted: boolean;
};

const REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주"];
const MUST = /꼭|필수|반드시|만\s|만$|만\s*(가능|보고|원해|찾)|해야/;
const NICE = /좋겠|좋아요|선호|면\s*좋|웬만하면/;
const PAST =
  /해\s*봤|했어요|했고|했다|했습니다|정리했|분석했|다뤄\s*봤|써\s*봤|경험이\s*있/;
const NEG =
  /안\s*써|써\s*본\s*적\s*(이\s*)?없|못\s*써|안\s*해\s*봤|해\s*본\s*적\s*(이\s*)?없/;
const TRANSITION = /옮기|옮겨|전환|바꾸고|바꿔\s*보|새로운\s*분야/;

const SKILLS: [RegExp, string][] = [
  [/sql/i, "SQL"],
  [/python|파이썬/i, "Python"],
  [/excel|엑셀|스프레드시트/i, "Excel"],
  [/crm/i, "CRM"],
];

function jobsIn(s: string) {
  const found: string[] = [];
  if (/데이터\s*분석/.test(s)) found.push("데이터 분석");
  else if (/데이터/.test(s)) found.push("데이터");
  if (
    /리서치|시장\s*조사|자료\s*조사|산업\s*(자료|조사)|조사[·ㆍ\s]*분석/.test(s)
  )
    found.push("리서치");
  if (/제품\s*(운영|개선)/.test(s)) found.push("제품 운영");
  else if (/서비스\s*운영/.test(s)) found.push("서비스 운영");
  if (/사업\s*지원|고객을\s*만나|고객\s*접점|영업\s*지원/.test(s))
    found.push("사업지원");
  return found;
}

function strengthOf(s: string, fallback: Strength): Strength {
  if (MUST.test(s)) return "must";
  if (NICE.test(s)) return "nice";
  return fallback;
}

export function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Draft = Partial<Omit<Criteria, "jobs">> & {
  jobs: Criterion<string>[];
  removeRegion?: boolean;
};

/** 문장에서 조건 초안만 뽑는다. S00 입력 미리보기와 대화가 같은 규칙을 쓴다. */
export function readCriteria(text: string) {
  const draft: Draft = { jobs: [] };
  const sentences = splitSentences(text);
  const transition = TRANSITION.test(text);
  let career: Experience["career"];
  const experience: string[] = [];
  const skills: Record<string, boolean> = {};
  let vague = false;

  for (const s of sentences) {
    const negative = NEG.test(s);
    const past = !negative && PAST.test(s);

    const c = s.match(
      /(제품\s*운영|영업\s*운영|서비스\s*운영|데이터\s*분석|영업|마케팅|운영|개발|기획)[을를은는]?\s*(?:경력\s*)?(\d+)\s*년/,
    );
    if (c) career = { field: c[1].replace(/\s+/g, " "), years: Number(c[2]) };

    if (negative) {
      for (const [re, name] of SKILLS) if (re.test(s)) skills[name] = false;
      continue;
    }
    if (past) {
      experience.push(s);
      for (const [re, name] of SKILLS) if (re.test(s)) skills[name] = true;
      if (/정리/.test(s)) skills["자료 정리"] = true;
      if (/문서|보고서|제안서/.test(s)) skills["문서 작성"] = true;
      continue;
    }

    if (/지역은?\s*(아무\s*데나|어디든|어디라도|상관\s*없)/.test(s))
      draft.removeRegion = true;
    else {
      const region = REGIONS.find((r) => s.includes(r));
      if (region)
        draft.region = { value: region, strength: strengthOf(s, "must") };
    }
    if (/인턴/.test(s))
      draft.employment = { value: "인턴", strength: strengthOf(s, "must") };
    else if (/정규직/.test(s))
      draft.employment = { value: "정규직", strength: strengthOf(s, "must") };

    if (/신입/.test(s))
      draft.career = { value: { kind: "entry" }, strength: "must" };

    const remote = s.match(/주\s*(\d)\s*일\s*(?:이상\s*)?재택/);
    if (remote)
      draft.remote = {
        value: Number(remote[1]),
        strength: strengthOf(s, "nice"),
      };
    const work = s
      .replace(/주\s*\d\s*일\s*(?:이상\s*)?재택/, "")
      .match(/주\s*(\d)\s*일/);
    if (work)
      draft.workDays = {
        value: Number(work[1]),
        strength: strengthOf(s, "must"),
      };

    const salary = s.match(/연봉\s*(\d+(?:[.,]\d+)?)\s*(천|만)/);
    if (salary) {
      const n = Number(salary[1].replace(",", ""));
      draft.salary = {
        value: salary[2] === "천" ? n * 1000 : n,
        strength: strengthOf(s, "nice"),
      };
    }

    for (const job of jobsIn(s)) {
      if (draft.jobs.some((j) => j.value === job)) continue;
      draft.jobs.push({
        value: job,
        strength: transition ? "must" : strengthOf(s, "nice"),
      });
    }
    if (/사업\s*(쪽|관련|분야)/.test(s) && !jobsIn(s).length) vague = true;
  }

  if (
    career &&
    !transition &&
    /살릴|경력직|경력으로|경력\s*\d/.test(text) &&
    !draft.career
  )
    draft.career = {
      value: { kind: "experienced", years: career.years },
      strength: "must",
    };

  return { draft, career, experience, skills, vague, transition };
}

export function previewItems(text: string) {
  const { draft } = readCriteria(text);
  const items: { label: string; strength: Strength }[] = [];
  if (draft.region)
    items.push({ label: draft.region.value, strength: draft.region.strength });
  if (draft.employment)
    items.push({
      label: draft.employment.value,
      strength: draft.employment.strength,
    });
  if (draft.career)
    items.push({
      label: careerLabel(draft.career.value),
      strength: draft.career.strength,
    });
  if (draft.workDays)
    items.push({
      label: `주 ${draft.workDays.value}일 근무`,
      strength: draft.workDays.strength,
    });
  if (draft.remote)
    items.push({
      label: `주 ${draft.remote.value}일 재택`,
      strength: draft.remote.strength,
    });
  if (draft.salary)
    items.push({
      label: `연봉 ${won(draft.salary.value)} 이상`,
      strength: draft.salary.strength,
    });
  draft.jobs.forEach((j) =>
    items.push({ label: `${j.value} 업무`, strength: j.strength }),
  );
  return items;
}

const same = <T>(a: Criterion<T> | undefined, b: Criterion<T>) =>
  a !== undefined && JSON.stringify(a.value) === JSON.stringify(b.value);

function describe(field: string, value: unknown) {
  switch (field) {
    case "career":
      return careerLabel(value as Career);
    case "workDays":
      return `주 ${value}일`;
    case "remote":
      return `주 ${value}일 재택`;
    case "salary":
      return `연봉 ${won(value as number)} 이상`;
    default:
      return String(value);
  }
}

export function interpret(
  text: string,
  current: Criteria,
  experience: Experience,
  ctx: { questionsAsked: number; firstTurn: boolean },
): Interpretation {
  const read = readCriteria(text);
  const next: Criteria = { ...current, jobs: [...current.jobs] };
  const changes: Change[] = [];
  let proposal: Proposal | undefined;

  if (read.draft.removeRegion && next.region) {
    changes.push({ label: "지역", removed: true });
    next.region = undefined;
  }

  const single = [
    "region",
    "employment",
    "career",
    "workDays",
    "remote",
    "salary",
  ] as const;
  for (const field of single) {
    const incoming = read.draft[field] as Criterion<unknown> | undefined;
    if (!incoming) continue;
    const existing = current[field] as Criterion<unknown> | undefined;
    if (same(existing, incoming) && existing!.strength === incoming.strength)
      continue;
    if (
      existing &&
      existing.strength === "must" &&
      !same(existing, incoming) &&
      !proposal
    ) {
      const from = describe(field, existing.value);
      const to = describe(field, incoming.value);
      proposal = {
        text: `지금은 ${josa(from, "을", "를")} 꼭 맞아야 할 조건으로 두고 있어요. ${from} 대신 ${ro(to)} 바꿀까요?`,
        value: to,
        apply: { ...next, [field]: incoming },
        accept: `${ro(to)} 바꾸기`,
        keep: `${from} 유지`,
      };
      continue;
    }
    (next as Record<string, unknown>)[field] = incoming;
    changes.push({
      label: describe(field, incoming.value),
      strength: incoming.strength,
    });
  }

  for (const job of read.draft.jobs) {
    const i = next.jobs.findIndex((j) => j.value === job.value);
    if (i >= 0 && next.jobs[i].strength === job.strength) continue;
    if (i >= 0) next.jobs[i] = job;
    else next.jobs.push(job);
    changes.push({ label: `${job.value} 업무`, strength: job.strength });
  }
  if (proposal) proposal.apply = { ...proposal.apply, jobs: next.jobs };

  const nextExperience: Experience = {
    text: [experience.text, ...read.experience].filter(Boolean).join(" "),
    skills: { ...experience.skills, ...read.skills },
    career: read.career ?? experience.career,
  };
  const experienceNoted =
    read.experience.length > 0 ||
    Boolean(read.career) ||
    Object.keys(read.skills).length > 0;

  const reply: string[] = [];
  const outOfScope = /워라밸|분위기|조직\s*문화|야근|복지/.test(text);
  if (outOfScope)
    reply.push(
      "조직문화나 분위기는 이 공고만으로 확인할 수 없어요. 공고에 적힌 근무 시간과 근무 방식만 알려드릴 수 있어요.",
    );

  const addedResearch = read.draft.jobs.some((j) => j.value === "리서치");
  if (ctx.firstTurn && addedResearch)
    reply.push("시장 조사·자료 정리 업무를 중심으로 찾았어요.");
  if (read.transition && read.draft.jobs.length) {
    const job = read.draft.jobs[0].value;
    reply.push(`${job} 관련 업무를 꼭 맞아야 할 방향으로 두었어요.`);
    if (read.career)
      reply.push(
        `${read.career.field} ${read.career.years}년은 같은 직무 경력으로 보지 않고, 입력한 경험과 연결되는 업무를 먼저 보여드려요.`,
      );
  } else {
    const musts = changes
      .filter((c) => !c.removed && c.strength === "must")
      .map((c) => c.label);
    const nices = changes
      .filter((c) => !c.removed && c.strength === "nice")
      .map((c) => c.label);
    const parts = [
      musts.length
        ? `${josa(musts.join(" · "), "은", "는")} 꼭 맞아야 할 조건으로`
        : "",
      nices.length
        ? `${josa(nices.join(" · "), "은", "는")} 있으면 좋은 조건으로`
        : "",
    ].filter(Boolean);
    if (
      parts.length &&
      !(ctx.firstTurn && addedResearch && parts.length === 1 && !musts.length)
    )
      reply.push(`${parts.join(", ")} 두었어요.`);
  }
  for (const c of changes.filter((c) => c.removed))
    reply.push(`${c.label} 조건을 뺐어요. 다른 조건은 그대로예요.`);
  if (
    read.draft.workDays &&
    changes.some((c) => c.label.startsWith("주 ") && !c.label.includes("재택"))
  )
    reply.push("근무일이 공고에 없는 곳은 ‘추가 확인’으로 나눠 두었어요.");
  if (read.draft.salary)
    reply.push(
      "연봉이 공고에 없으면 ‘추가 확인’으로 나눠요. 시세로 채워 넣지 않아요.",
    );
  if (experienceNoted && read.experience.length)
    reply.push(
      "말씀하신 경험은 이 탐색에서만 기억해요. 준비 프롬프트에는 직접 고를 때만 넣어요.",
    );
  if (
    Object.values(read.skills).some((v) => v === false) &&
    !read.experience.length
  )
    reply.push("알려주신 내용을 반영해 필수 요건을 다시 대조했어요.");

  let question: Question | undefined;
  if (!proposal && ctx.questionsAsked < 2) {
    if (read.vague && !next.jobs.length)
      question = {
        text: "조사·분석과 고객 접점 중 어느 쪽에 더 관심이 있나요?",
        options: ["조사·분석 쪽이 좋아요", "고객을 만나는 일이 좋아요"],
      };
    else if (
      ctx.firstTurn &&
      next.employment?.value === "인턴" &&
      !next.workDays
    )
      question = {
        text: "근무 가능한 요일이나 기간이 정해져 있나요?",
        options: ["주 3일만 가능해요", "주 5일도 괜찮아요"],
      };
  }

  if (!reply.length && !proposal && !question)
    reply.push(
      "어떤 조건을 바꿀지 알아듣지 못했어요. ‘서울만’, ‘주 3일 가능’처럼 말씀하시거나 조건 편집을 사용해 보세요.",
    );

  return {
    criteria: next,
    experience: nextExperience,
    changes,
    reply,
    proposal,
    question,
    experienceNoted,
  };
}

export function receiptText(changes: Change[]) {
  if (!changes.length) return null;
  if (changes.length === 1)
    return changes[0].removed
      ? `${changes[0].label} 조건을 뺐어요`
      : `${changes[0].label} 조건을 적용했어요`;
  return `조건 ${changes.length}개를 적용했어요`;
}
