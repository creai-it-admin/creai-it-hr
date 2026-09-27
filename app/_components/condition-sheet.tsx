"use client";

import { useState, type ReactNode } from "react";
import type {
  Career,
  Criteria,
  Criterion,
  Experience,
  Strength,
} from "../_demo/match";
import {
  applyCriteria,
  setExperience,
  setRemember,
  useApp,
} from "../_demo/store";
import { Sheet } from "./sheet";

const JOBS = [
  "리서치",
  "사업지원",
  "데이터 분석",
  "데이터",
  "제품 운영",
  "서비스 운영",
];
const SKILLS = ["SQL", "Python", "Excel", "CRM"];

function StrengthToggle({
  value,
  onChange,
  name,
}: {
  value: Strength;
  onChange: (s: Strength) => void;
  name: string;
}) {
  return (
    <div
      className="strength"
      role="radiogroup"
      aria-label={`${name} 조건의 중요도`}
    >
      {(["must", "nice"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
        >
          {s === "must" ? "꼭 맞아야 해요" : "있으면 좋아요"}
        </button>
      ))}
    </div>
  );
}

function Row<T>({
  name,
  value,
  options,
  onChange,
  hint,
}: {
  name: string;
  value: Criterion<T> | undefined;
  options: { label: string; value: T }[];
  onChange: (next: Criterion<T> | undefined) => void;
  hint?: ReactNode;
}) {
  const index = value
    ? options.findIndex(
        (o) => JSON.stringify(o.value) === JSON.stringify(value.value),
      )
    : -1;
  return (
    <div className="field">
      <label className="field-label">
        <span>{name}</span>
        <select
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(
              i < 0
                ? undefined
                : {
                    value: options[i].value,
                    strength: value?.strength ?? "must",
                  },
            );
          }}
        >
          <option value={-1}>상관없음</option>
          {options.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <StrengthToggle
          name={name}
          value={value.strength}
          onChange={(strength) => onChange({ ...value, strength })}
        />
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** S02 조건 편집. 적용해야 반영되고, 취소하면 직전 조건으로 돌아간다. */
export function ConditionSheet({
  open,
  onClose,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  focus?: "experience";
}) {
  const s = useApp();
  return open ? (
    <ConditionForm
      key={JSON.stringify(s.session.criteria)}
      criteria={s.session.criteria}
      experience={s.session.experience}
      remember={s.local.remember}
      onClose={onClose}
      focus={focus}
    />
  ) : null;
}

function ConditionForm({
  criteria,
  experience,
  remember,
  onClose,
  focus,
}: {
  criteria: Criteria;
  experience: Experience;
  remember: boolean;
  onClose: () => void;
  focus?: "experience";
}) {
  const [c, setC] = useState<Criteria>(criteria);
  const [exp, setExp] = useState<Experience>(experience);
  const [keep, setKeep] = useState(remember);
  const [salaryUnit, setSalaryUnit] = useState<"annual" | "monthly">("annual");
  const [salaryInput, setSalaryInput] = useState(
    criteria.salary ? String(criteria.salary.value) : "",
  );
  const put = <K extends keyof Criteria>(k: K, v: Criteria[K]) =>
    setC((prev) => ({ ...prev, [k]: v }));

  const apply = () => {
    const n = Number(salaryInput.replace(/[^\d]/g, ""));
    const salary =
      n > 0
        ? {
            value: salaryUnit === "monthly" ? n * 12 : n,
            strength: c.salary?.strength ?? "must",
          }
        : undefined;
    applyCriteria({ ...c, salary }, "탐색 조건을 바꿨어요");
    setExperience(exp);
    if (keep !== remember) setRemember(keep);
    onClose();
  };

  const toggleJob = (job: string) => {
    const i = c.jobs.findIndex((j) => j.value === job);
    put(
      "jobs",
      i >= 0
        ? c.jobs.filter((_, k) => k !== i)
        : [...c.jobs, { value: job, strength: "nice" }],
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="탐색 조건"
      eyebrow="적용하기 전에는 결과가 바뀌지 않아요"
      className="sheet-conditions"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={apply}>
            적용하기
          </button>
        </>
      }
    >
      <section className="form-section">
        <h3>원하는 기회</h3>
        <p className="form-note">고르지 않아도 탐색할 수 있어요.</p>
        <div className="job-picks">
          {JOBS.map((job) => {
            const on = c.jobs.find((j) => j.value === job);
            return (
              <button
                key={job}
                type="button"
                className={`pick ${on ? "is-on" : ""}`}
                aria-pressed={Boolean(on)}
                onClick={() => toggleJob(job)}
              >
                {job}
              </button>
            );
          })}
        </div>
        {c.jobs.map((j, i) => (
          <div className="field inline" key={j.value}>
            <span className="field-label-text">{j.value} 업무</span>
            <StrengthToggle
              name={`${j.value} 업무`}
              value={j.strength}
              onChange={(strength) =>
                put(
                  "jobs",
                  c.jobs.map((x, k) => (k === i ? { ...x, strength } : x)),
                )
              }
            />
          </div>
        ))}
      </section>

      <section className="form-section">
        <h3>일할 조건</h3>
        <Row
          name="지역"
          value={c.region}
          onChange={(v) => put("region", v)}
          options={["서울", "경기", "부산"].map((r) => ({
            label: r,
            value: r,
          }))}
        />
        <Row
          name="고용 형태"
          value={c.employment}
          onChange={(v) => put("employment", v)}
          options={[
            { label: "인턴", value: "인턴" as const },
            { label: "정규직", value: "정규직" as const },
          ]}
        />
        <Row<Career>
          name="경력"
          value={c.career}
          onChange={(v) => put("career", v)}
          options={[
            { label: "신입", value: { kind: "entry" } },
            {
              label: "경력 1년 이상",
              value: { kind: "experienced", years: 1 },
            },
            {
              label: "경력 3년 이상",
              value: { kind: "experienced", years: 3 },
            },
          ]}
        />
      </section>

      <details
        className="form-section more"
        open={Boolean(c.workDays || c.remote || c.salary || c.startMonth)}
      >
        <summary>
          <h3>더 구체적인 조건</h3>
          <span>근무일 · 재택 · 시작 시기 · 급여</span>
        </summary>
        <Row
          name="주 근무일"
          value={c.workDays}
          onChange={(v) => put("workDays", v)}
          options={[2, 3, 4, 5].map((n) => ({
            label: `주 ${n}일까지 가능`,
            value: n,
          }))}
          hint="근무일이 공고에 없으면 ‘추가 확인’ 그룹으로 나눠요."
        />
        <Row
          name="재택"
          value={c.remote}
          onChange={(v) => put("remote", v)}
          options={[1, 2, 3].map((n) => ({
            label: `주 ${n}일 이상`,
            value: n,
          }))}
          hint="‘재택 협의’처럼 적힌 공고는 충족으로 보지 않고 확인 필요로 둬요."
        />
        <Row
          name="시작 가능 시기"
          value={c.startMonth}
          onChange={(v) => put("startMonth", v)}
          options={[10, 11, 12].map((m) => ({ label: `${m}월부터`, value: m }))}
        />
        <div className="field">
          <label className="field-label">
            <span>급여 하한</span>
            <span className="money">
              <select
                value={salaryUnit}
                onChange={(e) =>
                  setSalaryUnit(e.target.value as "annual" | "monthly")
                }
                aria-label="급여 단위"
              >
                <option value="annual">연봉</option>
                <option value="monthly">월급</option>
              </select>
              <input
                inputMode="numeric"
                placeholder="예: 5000"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                aria-label="급여 하한 금액"
              />
              <span className="unit">만원</span>
            </span>
          </label>
          {salaryInput && (
            <StrengthToggle
              name="급여"
              value={c.salary?.strength ?? "must"}
              onChange={(strength) =>
                put("salary", { value: c.salary?.value ?? 0, strength })
              }
            />
          )}
          <p className="field-hint">
            급여가 공고에 없으면 ‘추가 확인’ 그룹으로 갈 수 있어요. 시세로 채워
            넣지 않아요.
          </p>
        </div>
      </details>

      <section className="form-section">
        <h3>경험</h3>
        <p className="form-note">
          선택 입력이에요. 이 탐색에서만 쓰고 저장하지 않아요.
        </p>
        <textarea
          className="textarea"
          rows={3}
          value={exp.text}
          data-autofocus={focus === "experience" ? true : undefined}
          placeholder="예: 수업 프로젝트에서 SQL로 고객 구매 데이터를 분석했어요."
          onChange={(e) => setExp({ ...exp, text: e.target.value })}
          aria-label="경험 자유 서술"
        />
        <div className="skills">
          {SKILLS.map((skill) => (
            <div className="skill" key={skill}>
              <span>{skill}</span>
              <div
                className="strength"
                role="radiogroup"
                aria-label={`${skill} 사용 경험`}
              >
                {(
                  [
                    [true, "써봤어요"],
                    [false, "아직이요"],
                    [undefined, "미입력"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={exp.skills[skill] === v}
                    onClick={() => {
                      const skills = { ...exp.skills };
                      if (v === undefined) delete skills[skill];
                      else skills[skill] = v;
                      setExp({ ...exp, skills });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <label className="switch">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
          />
          <span className="switch-track" aria-hidden />
          <span>
            <b>탐색 조건을 이 브라우저에 기억</b>
            <small>
              다음에 와도 조건이 남아요. 경험 서술은 저장하지 않아요.
            </small>
          </span>
        </label>
      </section>
    </Sheet>
  );
}
