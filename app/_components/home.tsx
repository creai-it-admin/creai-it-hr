"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SOURCE_ROWS } from "../_demo/fixtures";
import { previewItems } from "../_demo/interpret";
import {
  evaluate,
  sortEvaluations,
  EMPTY_CRITERIA,
  EMPTY_EXPERIENCE,
  type Career,
  type Criteria,
} from "../_demo/match";
import {
  setHomeDraft,
  startSearch,
  useHydrated,
  useWorld,
} from "../_demo/store";
import { ArrowRight } from "./icons";
import { JobCard } from "./job-card";
import { CompareBar } from "./shell";

const EXAMPLES = [
  {
    label: "첫 인턴",
    text: "서울에서 리서치 경험을 쌓을 인턴을 찾고 있어요. 학기 중에는 주 3일 가능해요.",
  },
  {
    label: "신입 채용",
    text: "서울에서 신입으로 데이터 분석 일을 하고 싶어요.",
  },
  {
    label: "이직 기회",
    text: "서울에서 제품 운영 경력 3년을 살릴 일을 보고 있어요. 연봉 5천 이상과 주 2일 재택은 꼭 필요해요.",
  },
];

const CAREERS: Record<string, Career> = {
  신입: { kind: "entry" },
  "경력 1년 이상": { kind: "experienced", years: 1 },
  "경력 3년 이상": { kind: "experienced", years: 3 },
};

export function Home() {
  const { s, postings, now } = useWorld();
  const hydrated = useHydrated();
  const router = useRouter();
  const [job, setJob] = useState("");
  const [region, setRegion] = useState("");
  const [employment, setEmployment] = useState("");
  const [career, setCareer] = useState("");
  const [aiError, setAiError] = useState(false);
  const [more, setMore] = useState(false);
  const text = s.session.homeDraft;
  const preview = previewItems(text);

  const filters: Criteria = {
    ...EMPTY_CRITERIA,
    jobs: job ? [{ value: job, strength: "nice" }] : [],
    region: region ? { value: region, strength: "must" } : undefined,
    employment: employment
      ? { value: employment as "인턴" | "정규직", strength: "must" }
      : undefined,
    career: career ? { value: CAREERS[career], strength: "must" } : undefined,
  };

  const go = (withText: boolean) => {
    if (withText && text.trim() && s.demo.failures.ai) {
      setAiError(true);
      return;
    }
    setAiError(false);
    startSearch(withText ? text : "", filters);
    router.push("/explore");
  };

  const recent = sortEvaluations(
    postings.map((p) => evaluate(p, EMPTY_CRITERIA, EMPTY_EXPERIENCE, now)),
    "recent",
  ).sort(
    (a, b) =>
      Number(a.availability !== "open") - Number(b.availability !== "open"),
  );
  const shown = more ? recent : recent.slice(0, 6);

  return (
    <div className="page home">
      <div className="home-top">
        <section className="home-hero">
          <h1 className="home-title">
            다음 기회,
            <br />
            <em>내 조건에서부터.</em>
          </h1>
          <p className="home-sub">
            원하는 일을 설명하거나, 공고를 직접 살펴보세요.
          </p>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              go(true);
            }}
          >
            <label htmlFor="situation" className="sr-only">
              내 상황이나 원하는 일
            </label>
            <textarea
              id="situation"
              className="composer-input"
              rows={3}
              value={hydrated ? text : ""}
              onChange={(e) => setHomeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  go(true);
                }
              }}
              placeholder="서울에서 리서치 경험을 쌓을 인턴을 찾고 있어요. 학기 중에는 주 3일 가능해요."
            />
            <div className="composer-examples">
              <span>예시</span>
              {EXAMPLES.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  className="example"
                  onClick={() => setHomeDraft(x.text)}
                >
                  {x.label}
                </button>
              ))}
            </div>

            <div
              className={`composer-preview ${preview.length && hydrated ? "is-on" : ""}`}
              aria-live="polite"
            >
              {preview.length > 0 && hydrated && (
                <>
                  <span className="composer-preview-label">
                    이렇게 찾아볼게요
                  </span>
                  {preview.map((i) => (
                    <span
                      key={i.label}
                      className={`chip chip-${i.strength} is-static`}
                    >
                      <span className="sr-only">
                        {i.strength === "must"
                          ? "꼭 맞아야 하는 조건"
                          : "있으면 좋은 조건"}
                        :{" "}
                      </span>
                      {i.label}
                    </span>
                  ))}
                  <span className="composer-preview-hint">
                    검색 후 칩에서 바로 고칠 수 있어요
                  </span>
                </>
              )}
            </div>

            <div className="composer-bar">
              <div className="filters" role="group" aria-label="기본 필터">
                <select
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  aria-label="직무·업무"
                  className={job ? "is-set" : ""}
                >
                  <option value="">직무·업무</option>
                  {[
                    "리서치",
                    "사업지원",
                    "데이터 분석",
                    "데이터 운영",
                    "제품 운영",
                    "서비스 운영",
                  ].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  aria-label="지역"
                  className={region ? "is-set" : ""}
                >
                  <option value="">지역</option>
                  {["서울", "경기", "부산"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <select
                  value={employment}
                  onChange={(e) => setEmployment(e.target.value)}
                  aria-label="고용 형태"
                  className={employment ? "is-set" : ""}
                >
                  <option value="">고용 형태</option>
                  <option>인턴</option>
                  <option>정규직</option>
                </select>
                <select
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  aria-label="경력"
                  className={career ? "is-set" : ""}
                >
                  <option value="">경력</option>
                  {Object.keys(CAREERS).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">
                기회 찾기
                <ArrowRight width={16} height={16} />
              </button>
            </div>

            {aiError && (
              <div className="inline-alert" role="alert">
                <p>
                  <b>지금은 AI 조건 정리를 사용할 수 없어요.</b> 입력한 내용은
                  그대로 두었어요. 필터로 찾거나 잠시 후 다시 시도하세요.
                </p>
                <div>
                  <button
                    type="button"
                    className="text-btn strong"
                    onClick={() => go(false)}
                  >
                    필터만으로 찾기
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => go(true)}
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            )}
          </form>

          {hydrated && !s.session.seenIntro && (
            <p className="home-note">
              회원가입 없이 이용할 수 있어요. 이력서·학교·연락처를 묻지 않아요.
            </p>
          )}
        </section>

        <figure className="home-venn">
          <svg
            viewBox="0 0 380 262"
            role="img"
            aria-labelledby="venn-title venn-desc"
          >
            <title id="venn-title">
              내 조건과 공고가 겹치는 곳을 보여주는 예시
            </title>
            <desc id="venn-desc">
              이음브릿지 사업지원 인턴 예시. 서울과 인턴은 겹쳐서 맞아요. 주 3일
              근무는 공고에 없어 확인이 필요하고, 문서 작성 능력은 내 경험을
              확인해야 해요.
            </desc>
            <circle className="v-mine" cx="136" cy="131" r="112" />
            <circle className="v-post" cx="244" cy="131" r="112" />
            <text className="v-title" x="76" y="108" textAnchor="middle">
              내 조건
            </text>
            <text className="v-note" x="76" y="132" textAnchor="middle">
              주 3일 가능
            </text>
            <text className="v-note" x="76" y="150" textAnchor="middle">
              공고에 없음
            </text>
            <text className="v-core" x="190" y="124" textAnchor="middle">
              서울 · 인턴
            </text>
            <text className="v-core-note" x="190" y="144" textAnchor="middle">
              맞아요
            </text>
            <text className="v-title" x="304" y="108" textAnchor="middle">
              공고
            </text>
            <text className="v-note" x="304" y="132" textAnchor="middle">
              문서 작성 필수
            </text>
            <text className="v-note" x="304" y="150" textAnchor="middle">
              내 경험 확인
            </text>
          </svg>
          <figcaption className="home-venn-caption">
            겹치는 곳은 맞는 조건, 한쪽에만 있는 것은 확인할 점이에요.
            <br />
            적합도 점수는 매기지 않아요.
          </figcaption>
        </figure>
      </div>

      <section className="home-recent" aria-labelledby="recent-title">
        <header className="section-head">
          <h2 id="recent-title">최근 수집한 공고</h2>
          <p>
            게시일이 아니라 우리가 공고 본문을 마지막으로 확인한 시각 순서예요.
          </p>
        </header>
        {hydrated ? (
          <div className="card-grid">
            {shown.map((r) => (
              <JobCard
                key={r.posting.id}
                result={r}
                now={now}
                personal={false}
                origin="home"
              />
            ))}
          </div>
        ) : (
          <div className="card-grid is-loading" aria-hidden />
        )}
        {!more && recent.length > 6 && (
          <button
            type="button"
            className="btn-secondary more"
            onClick={() => setMore(true)}
          >
            더 보기 <span className="muted">{recent.length - 6}개</span>
          </button>
        )}
      </section>

      <footer className="scope">
        <p>
          <b>수집 범위</b> 사람인·잡코리아·인크루트의 신입·인턴 공고 일부를 모아
          정기적으로 다시 확인해요. 모든 공고를 모으지는 않아요.
        </p>
        <p className="muted">
          이 목업의 공고는 합성 데이터예요 · 공고 {recent.length}개(출처별{" "}
          {SOURCE_ROWS}건) · 같은 모집으로 확인된 출처만 하나로 묶어요.
        </p>
      </footer>
      <CompareBar />
    </div>
  );
}
