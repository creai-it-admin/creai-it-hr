import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseDetail } from "./parse";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const ref = {
  source: "saramin" as const,
  id: "55115949",
  url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55115949",
};
test("Saramin discovers the primary ID only and retains the next page", () => {
  const page = parseList({
    html: fixture("list"),
    url: "https://www.saramin.co.kr/zf_user/jobs/public/list?page=1",
  });
  assert.deepEqual(
    page.items.map((x) => x.id),
    ["55115949"],
  );
  assert.equal(page.next, "2");
});
test("Saramin isolates the requested job from appended full job details", () => {
  const result = parseDetail(
    {
      html: fixture("detail"),
      url: ref.url,
      body: {
        html: "<table><tr><td>품질 관리 업무</td></tr></table>",
        url: "https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=55115949",
      },
    },
    ref,
    "2026-09-26T00:00:00.000Z",
  );
  assert.equal(result.fields.title, "생산QC 채용");
  assert.equal(result.fields.conditions?.["경력"], "신입 · 경력");
  assert.deepEqual(result.fields.endsAt, {
    value: "2026-10-07T14:59:00.000Z",
    precision: "minute",
  });
  assert.match(result.fields.bodyText!, /품질 관리/);
});
test("Saramin fails closed on identity mismatch, not as a closed vacancy", () => {
  assert.throws(
    () =>
      parseDetail(
        { html: fixture("detail"), url: ref.url },
        { ...ref, id: "123" },
        "2026-09-26T00:00:00.000Z",
      ),
    /identity/i,
  );
});
test("Saramin distinguishes a closing-date label from an actual closed notice", () => {
  const html = fixture("detail").replace("마감일", "접수마감일");
  assert.equal(
    parseDetail({ url: ref.url, html }, ref, "2026-09-26T00:00:00.000Z").fields
      .sourceStatus,
    "open",
  );
  assert.equal(
    parseDetail(
      {
        url: ref.url,
        html: html.replace("<button>입사지원</button>", "<div>접수마감</div>"),
      },
      ref,
      "2026-09-26T00:00:00.000Z",
    ).fields.sourceStatus,
    "closed",
  );
});
