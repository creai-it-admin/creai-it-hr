import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import type { Snapshot } from "../../server/ingestion/contracts";
const ref = {
  source: "incruit" as const,
  id: "100",
  url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=100",
};
const start = "2026-09-26T00:00:00.000Z",
  later = "2026-09-27T00:00:00.000Z";
const snap = (at = start): Snapshot => ({
  ref,
  observedAt: at,
  fields: {
    title: "개발자",
    company: "회사",
    bodyText: "서비스 개발",
    bodyImages: [],
    conditions: { 경력: "신입" },
    endsAt: { value: "2026-10-10", precision: "day" },
    sourceStatus: "open",
  },
  quality: "text",
  issues: [],
});
test("Repeated observations create one posting, one initial revision and one analysis task", async () => {
  const { db, r } = await setup();
  try {
    await r.observe(ref, start);
    assert.equal(await r.save(snap()), "created");
    await r.observe(ref, later);
    assert.equal(await r.save(snap(later)), "unchanged");
    assert.equal(await r.count("source_postings"), 1);
    assert.equal(await r.count("posting_revisions"), 1);
    assert.equal(await r.count("analysis_tasks"), 1);
  } finally {
    await db.close();
  }
});
test("A body edit creates a revision and a new analysis input; whitespace does not", async () => {
  const { db, r } = await setup();
  try {
    await r.save(snap());
    const changed = snap(later);
    changed.fields.bodyText = "플랫폼 운영 및 서비스 개발";
    assert.equal(await r.save(changed), "changed");
    assert.equal(await r.count("analysis_tasks"), 2);
    assert.equal(
      await r.save({
        ...changed,
        observedAt: "2026-09-28T00:00:00.000Z",
        fields: {
          ...changed.fields,
          bodyText: "  플랫폼 운영   및 서비스 개발\n",
        },
      }),
      "unchanged",
    );
    assert.equal(await r.count("posting_revisions"), 2);
  } finally {
    await db.close();
  }
});
test("Deadline extension creates a revision without another LLM task", async () => {
  const { db, r } = await setup();
  try {
    await r.save(snap());
    const s = snap(later);
    s.fields.endsAt = { value: "2026-11-01", precision: "day" };
    await r.save(s);
    assert.equal((await r.get(ref))!.fields.endsAt!.value, "2026-11-01");
    assert.equal(await r.count("posting_revisions"), 2);
    assert.equal(await r.count("analysis_tasks"), 1);
  } finally {
    await db.close();
  }
});
test("Explicit closure and reopen are retained as distinct revisions", async () => {
  const { db, r } = await setup();
  try {
    await r.save(snap());
    await r.save({ ...snap(later), fields: { sourceStatus: "closed" } });
    assert.equal((await r.get(ref))!.fields.sourceStatus, "closed");
    await r.save({
      ...snap("2026-09-28T00:00:00.000Z"),
      fields: { sourceStatus: "open" },
    });
    assert.equal((await r.get(ref))!.fields.sourceStatus, "open");
    assert.equal(await r.count("posting_revisions"), 3);
    assert.equal(await r.count("analysis_tasks"), 1);
  } finally {
    await db.close();
  }
});
test("Missing iframe and failed fetch retain prior body and do not mark a job closed", async () => {
  const { db, r } = await setup();
  try {
    await r.save(snap());
    await r.save({
      ...snap(later),
      fields: { title: "개발자" },
      quality: "unavailable",
      issues: ["iframe timeout"],
    });
    await r.failure(ref, "2026-09-28T00:00:00.000Z", "HTTP 429");
    const row = (await r.get(ref))!;
    assert.equal(row.fields.bodyText, "서비스 개발");
    assert.equal(row.fields.sourceStatus, "open");
    assert.equal(row.fetchState, "failed");
    assert.equal(await r.count("posting_revisions"), 1);
  } finally {
    await db.close();
  }
});
test("A late old success or failure cannot overwrite a newer observation", async () => {
  const { db, r } = await setup();
  try {
    await r.save({
      ...snap(later),
      fields: { ...snap().fields, bodyText: "최신 업무" },
    });
    assert.equal(await r.save(snap()), "stale");
    await r.failure(ref, start, "old timeout");
    assert.equal((await r.get(ref))!.fields.bodyText, "최신 업무");
    assert.equal((await r.get(ref))!.fetchState, "ok");
  } finally {
    await db.close();
  }
});
test("Different sources with the same numeric ID remain distinct", async () => {
  const { db, r } = await setup();
  try {
    await r.save(snap());
    await r.save({
      ...snap(),
      ref: {
        source: "saramin",
        id: "100",
        url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=100",
      },
    });
    assert.equal(await r.count("source_postings"), 2);
  } finally {
    await db.close();
  }
});
test("Analysis enqueue failure rolls back the posting and revision transaction", async () => {
  const { db, r } = await setup();
  try {
    await db.query(`CREATE FUNCTION ${db.schema}.reject_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage failure'; END $$;
      CREATE TRIGGER fail_analysis BEFORE INSERT ON ${db.schema}.analysis_tasks FOR EACH ROW EXECUTE FUNCTION ${db.schema}.reject_task()`);
    await assert.rejects(() => r.save(snap()), /test storage failure/);
    assert.equal(await r.count("source_postings"), 0);
    assert.equal(await r.count("posting_revisions"), 0);
  } finally {
    await db.close();
  }
});
test("Due selection retains failed and discovered-but-unread postings across runs", async () => {
  const { db, r } = await setup();
  try {
    await r.observe(ref, start);
    assert.equal((await r.due("incruit", start, 10)).length, 1);
    await r.save(snap());
    assert.equal((await r.due("incruit", start, 10)).length, 0);
    assert.equal(
      (await r.due("incruit", "2026-09-29T00:00:00.000Z", 10)).length,
      1,
    );
  } finally {
    await db.close();
  }
});
