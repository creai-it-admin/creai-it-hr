"use client";

import Link from "next/link";
import { useState } from "react";
import { findPosting } from "../_demo/fixtures";
import { EMPTY_CRITERIA, EMPTY_EXPERIENCE, evaluate } from "../_demo/match";
import { clearLocal, useHydrated, useWorld } from "../_demo/store";
import { Trash } from "./icons";
import { JobCard } from "./job-card";
import { CompareBar } from "./shell";

/** S06. 복잡한 지원 관리가 아니라 다시 봐야 할 후보와 달라진 점을 먼저 읽는 공간. */
export function Saved() {
  const { s, postings, now } = useWorld();
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  if (!hydrated)
    return <div className="page saved is-loading" aria-busy="true" />;

  // 저장 목록에서는 개인화 이유 대신 현재 상태와 변경을 먼저 읽게 한다. 기준과의 대조는 상세에서 본다.
  const items = s.local.saved.map((x) => {
    const p = findPosting(postings, x.id);
    return {
      saved: x,
      result: p ? evaluate(p, EMPTY_CRITERIA, EMPTY_EXPERIENCE, now) : null,
    };
  });
  const live = items.filter(
    (i) => i.result && i.result.availability === "open",
  );
  const attention = items.filter(
    (i) => i.result && i.result.availability !== "open",
  );
  const missing = items.filter((i) => !i.result);

  return (
    <div className="page saved">
      <header className="page-head">
        <h1 className="page-title">저장한 공고</h1>
        <p className="muted">
          이 브라우저에 저장됩니다. 다른 기기나 시크릿 창에는 이어지지 않아요.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="empty">
          <p>관심 있는 공고를 저장해두고 다시 확인하세요.</p>
          <Link
            href={s.session.searched ? "/explore" : "/"}
            className="btn-primary"
          >
            기회 찾기
          </Link>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <section className="group">
              <header className="group-head">
                <h2>
                  검토 중 <span className="count">{live.length}</span>
                </h2>
                <p>
                  저장한 순서예요. 현재 정보는 마지막 본문 확인 기준으로 다시
                  보여드려요.
                </p>
              </header>
              <div className="card-list">
                {live.map((i) => (
                  <JobCard
                    key={i.saved.id}
                    result={i.result!}
                    now={now}
                    personal={false}
                    origin="saved"
                  />
                ))}
              </div>
            </section>
          )}
          {attention.length > 0 && (
            <section className="group group-attention">
              <header className="group-head">
                <h2>
                  마감·상태 확인 필요{" "}
                  <span className="count">{attention.length}</span>
                </h2>
                <p>자동으로 지우지 않아요. 원문에서 현재 상태를 확인하세요.</p>
              </header>
              <div className="card-list">
                {attention.map((i) => (
                  <JobCard
                    key={i.saved.id}
                    result={i.result!}
                    now={now}
                    personal={false}
                    origin="saved"
                  />
                ))}
              </div>
            </section>
          )}
          {missing.length > 0 && (
            <p className="notice notice-quiet">
              저장했던 공고 {missing.length}개를 지금은 찾을 수 없어요. 다른
              공고로 대신 보여주지 않아요.
            </p>
          )}
        </>
      )}

      <footer className="saved-foot">
        {confirming ? (
          <div
            className="confirm"
            role="alertdialog"
            aria-labelledby="clear-title"
          >
            <p id="clear-title">
              저장한 공고 {items.length}개와 기억한 탐색 조건을 이 브라우저에서
              지울까요? 되돌릴 수 없어요.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  clearLocal();
                  setConfirming(false);
                }}
              >
                지우기
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="text-btn quiet"
            onClick={() => setConfirming(true)}
          >
            <Trash width={15} height={15} />이 브라우저의 기록 지우기
          </button>
        )}
        <p className="muted">
          공용 기기라면 사용 후 지워 주세요. 저장 기록은 서버로 보내지 않아요.
        </p>
      </footer>
      <CompareBar />
    </div>
  );
}
