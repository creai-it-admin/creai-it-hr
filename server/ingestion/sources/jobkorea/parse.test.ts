import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseDetail } from "./parse";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const ref = {
  source: "jobkorea" as const,
  id: "50043788",
  url: "https://www.jobkorea.co.kr/Recruit/GI_Read/50043788",
};
test("JobKorea uses GI_Read/gno rather than gino and follows JS page metadata", () => {
  const p = parseList({
    html: fixture("list"),
    url: "https://www.jobkorea.co.kr/theme/entry-level-internship",
  });
  assert.equal(p.items[0].id, "50043788");
  assert.equal(p.next, "2");
});
test("JobKorea preserves mixed body quality and ignores recommended closing text", () => {
  const s = parseDetail(
    {
      url: ref.url,
      html: fixture("detail"),
      body: {
        url: "https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50043788",
        html: '<p>온라인 판매 관리</p><img src="https://file1.jobkorea.co.kr/sample.png">',
      },
    },
    ref,
    "2026-09-26T00:00:00.000Z",
  );
  assert.equal(s.quality, "mixed");
  assert.equal(s.fields.sourceStatus, "open");
  assert.match(s.fields.bodyText!, /온라인 판매/);
});
test("JobKorea does not promote JSON-LD description to the full body when iframe is missing", () => {
  const s = parseDetail(
    { url: ref.url, html: fixture("detail"), bodyError: "iframe timeout" },
    ref,
    "2026-09-26T00:00:00.000Z",
  );
  assert.equal(s.fields.bodyText, undefined);
  assert.equal(s.quality, "unavailable");
  assert.ok(s.issues.length);
});
test("JobKorea rejects mismatched iframe Gno", () =>
  assert.throws(
    () =>
      parseDetail(
        {
          url: ref.url,
          html: fixture("detail"),
          body: {
            url: "https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=999",
            html: "<p>다른 공고</p>",
          },
        },
        ref,
        "2026-09-26T00:00:00.000Z",
      ),
    /identity/i,
  ));
test("JobKorea does not interpret 접수마감일 as a closed posting", () => {
  const html = fixture("detail").replace(
    "<span>홈페이지 지원</span>",
    "<span>접수마감일 2026.10.10</span><span>홈페이지 지원</span>",
  );
  assert.equal(
    parseDetail({ url: ref.url, html }, ref, "2026-09-26T00:00:00.000Z").fields
      .sourceStatus,
    "open",
  );
  assert.equal(
    parseDetail(
      {
        url: ref.url,
        html: fixture("detail").replace("홈페이지 지원", "접수마감"),
      },
      ref,
      "2026-09-26T00:00:00.000Z",
    ).fields.sourceStatus,
    "closed",
  );
});
