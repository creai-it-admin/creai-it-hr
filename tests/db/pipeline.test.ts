import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup } from "./helpers";
import { discover } from "../../server/ingestion/discover";
import { refresh } from "../../server/ingestion/refresh";
import { createAdapter } from "../../server/ingestion/sources/registry";
import type {
  Source,
  SourceClient,
  PostingRef,
} from "../../server/ingestion/contracts";
const cases: [Source, string, string, string][] = [
  [
    "saramin",
    "55115949",
    "https://www.saramin.co.kr/zf_user/jobs/public/list",
    "https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=55115949",
  ],
  [
    "jobkorea",
    "50043788",
    "https://www.jobkorea.co.kr/theme/entry-level-internship",
    "https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50043788",
  ],
  [
    "incruit",
    "2609260000102",
    "https://job.incruit.com/jobdb_list/searchjob.asp?today=y",
    "https://job.incruit.com/s_common/jobpost/jobpostcont.asp?job=2609260000102",
  ],
];
for (const [source, id, listUrl, bodyUrl] of cases) {
  test(`${source}: actual parser → Neon PostgreSQL, repeat → no duplicates, refresh → edit, failure → retain`, async () => {
    const { db, r } = await setup();
    const fixture = (n: string) =>
      readFileSync(
        new URL(
          `../../server/ingestion/sources/${source}/fixtures/${n}.html`,
          import.meta.url,
        ),
        "utf8",
      );
    let body = "담당 업무는 제품 개발",
      broken = false,
      tick = 0;
    const now = () =>
      new Date(
        Date.parse("2026-09-26T00:00:00Z") + tick++ * 1000,
      ).toISOString();
    const client: SourceClient = {
      list: async () => ({ url: listUrl, html: fixture("list") }),
      detail: async (ref) => {
        if (broken) throw new Error("HTTP 503");
        return {
          url: ref.url,
          html: fixture("detail"),
          body: { url: bodyUrl, html: `<p>${body}</p>` },
        };
      },
      close: async () => {},
    };
    const adapter = createAdapter(source, { client });
    try {
      const first = await discover(
        adapter,
        r,
        { maxPages: 1, maxDetails: 5 },
        now,
      );
      assert.equal(first.created, 1);
      assert.equal(first.status, "partial");
      await discover(adapter, r, { maxPages: 1, maxDetails: 5 }, now);
      assert.equal(await r.count("source_postings"), 1);
      assert.equal(await r.count("posting_revisions"), 1);
      body = "담당 업무는 제품 개발 및 운영";
      const edit = await refresh(adapter, r, { maxDetails: 5, ids: [id] }, now);
      assert.equal(edit.changed, 1);
      assert.equal(await r.count("analysis_tasks"), 2);
      broken = true;
      const fail = await refresh(adapter, r, { maxDetails: 5, ids: [id] }, now);
      assert.equal(fail.status, "partial");
      assert.equal(fail.failed, 1);
      assert.equal(
        (await r.get({ source, id, url: "" }))!.fields.bodyText,
        "담당 업무는 제품 개발 및 운영",
      );
      assert.notEqual(
        (await r.get({ source, id, url: "" }))!.fields.sourceStatus,
        "closed",
      );
    } finally {
      await db.close();
    }
  });
}
test("Discovery detects repeated pages, retains pending details, and resumes through refresh", async () => {
  const { db, r } = await setup();
  const ref: PostingRef = {
    source: "incruit",
    id: "7",
    url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=7",
  };
  const adapter = {
    source: "incruit" as const,
    scope: "test",
    discover: async () => ({
      items: [ref],
      next: "2",
      complete: false,
      issues: [],
    }),
    read: async (x: PostingRef, at: string) => ({
      ref: x,
      observedAt: at,
      fields: { title: "작업", bodyText: "본문" },
      quality: "text" as const,
      issues: [],
    }),
    close: async () => {},
  };
  try {
    const report = await discover(adapter, r, { maxPages: 3, maxDetails: 0 });
    assert.equal(report.status, "partial");
    assert.ok(report.errors.some((e) => e.includes("repeated")));
    assert.equal(await r.count("source_postings"), 1);
    assert.equal(await r.count("posting_revisions"), 0);
    const recovery = await refresh(adapter, r, { maxDetails: 2 });
    assert.equal(recovery.created, 1);
  } finally {
    await db.close();
  }
});
test("A failed second page preserves first-page jobs and reports partial, not complete", async () => {
  const { db, r } = await setup();
  let n = 0;
  const ref: PostingRef = {
    source: "incruit",
    id: "1",
    url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=1",
  };
  const adapter = {
    source: "incruit" as const,
    scope: "test",
    discover: async () => {
      if (n++) throw new Error("page fetch failed");
      return { items: [ref], next: "2", complete: false, issues: [] };
    },
    read: async (x: PostingRef, at: string) => ({
      ref: x,
      observedAt: at,
      fields: { title: "test" },
      quality: "unavailable" as const,
      issues: ["body missing"],
    }),
    close: async () => {},
  };
  try {
    const result = await discover(adapter, r, { maxPages: 3, maxDetails: 1 });
    assert.equal(result.status, "partial");
    assert.equal(result.pages, 1);
    assert.equal(await r.count("source_postings"), 1);
  } finally {
    await db.close();
  }
});
test("Overlapping pages and a later newly published posting are deduplicated by identity", async () => {
  const { db, r: repo } = await setup();
  let round = 0;
  let reads = 0;
  const ref = (id: string): PostingRef => ({
    source: "incruit",
    id,
    url: `https://job.incruit.com/jobdb_info/jobpost.asp?job=${id}`,
    title: `공고 ${id}`,
  });
  const adapter = {
    source: "incruit" as const,
    scope: "test",
    discover: async (cursor?: string) => ({
      items: (cursor ? ["2", "3"] : round ? ["4", "1", "2"] : ["1", "2"]).map(
        ref,
      ),
      next: cursor ? null : "2",
      complete: !!cursor,
      issues: [],
    }),
    read: async (r: PostingRef, at: string) => {
      reads++;
      return {
        ref: r,
        observedAt: at,
        fields: { title: r.title, bodyText: "본문" },
        quality: "text" as const,
        issues: [],
      };
    },
    close: async () => {},
  };
  try {
    const first = await discover(adapter, repo, {
      maxPages: 3,
      maxDetails: 10,
    });
    assert.equal(first.status, "complete");
    assert.equal(first.created, 3);
    assert.equal(reads, 3);
    round = 1;
    const second = await discover(adapter, repo, {
      maxPages: 3,
      maxDetails: 10,
    });
    assert.equal(second.created, 1);
    assert.equal(second.discovered, 4);
    assert.equal(reads, 4);
    assert.equal(await repo.count("source_postings"), 4);
    assert.equal(await repo.count("analysis_tasks"), 4);
  } finally {
    await db.close();
  }
});
