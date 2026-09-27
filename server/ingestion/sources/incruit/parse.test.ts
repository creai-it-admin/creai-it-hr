import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseDetail } from "./parse";
const fixture = (n: string) =>
  readFileSync(new URL(`./fixtures/${n}.html`, import.meta.url), "utf8");
const ref = {
  source: "incruit" as const,
  id: "2609260000102",
  url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=2609260000102",
};
const at = "2026-09-26T00:00:00.000Z";
test("Incruit treats c_col as cells and follows filter-preserving next href", () => {
  const p = parseList({
    html: fixture("list"),
    url: "https://job.incruit.com/jobdb_list/searchjob.asp?today=y",
  });
  assert.equal(p.items.length, 1);
  assert.equal(
    p.next,
    "https://job.incruit.com/jobdb_list/searchjob.asp?today=y&page=2",
  );
});
test("Incruit reads exact deadline and working location rather than agency JSON-LD address", () => {
  const s = parseDetail(
    {
      html: fixture("detail"),
      url: ref.url,
      body: {
        html: "<p>주방 운영</p>",
        url: "https://job.incruit.com/s_common/jobpost/jobpostcont.asp?job=2609260000102",
      },
    },
    ref,
    at,
  );
  assert.deepEqual(s.fields.endsAt, {
    value: "2026-10-26T14:59:00.000Z",
    precision: "minute",
  });
  assert.equal(s.fields.conditions?.["근무지역"], "경기 여주시");
  assert.equal(s.fields.sourceStatus, "open");
});
test("Incruit recognizes syndicated closed template without reception section", () => {
  const html = fixture("detail")
    .replace(
      /<div class="reception">[\s\S]*?<div class="working_area">/,
      '<div class="working_area">',
    )
    .replace("<button>바로지원</button>", "<span>마감된 공고</span>");
  const s = parseDetail({ html, url: ref.url }, ref, at);
  assert.equal(s.fields.sourceStatus, "closed");
});
test("An unexpected empty list is a parse failure, not a completed zero-item crawl", () =>
  assert.throws(
    () =>
      parseList({
        html: "<html>서비스 점검</html>",
        url: "https://job.incruit.com/jobdb_list/searchjob.asp?today=y",
      }),
    /list|rows/i,
  ));
