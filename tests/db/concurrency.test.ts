import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { AnalysisRepository } from "../../server/analysis/repository";
import type { Snapshot } from "../../server/ingestion/contracts";
const ref = {
  source: "incruit" as const,
  id: "concurrent",
  url: "https://example.com/job",
};
const snapshot = (at: string, body = "first"): Snapshot => ({
  ref,
  observedAt: at,
  fields: { title: "role", bodyText: body },
  quality: "text",
  issues: [],
});

test("Concurrent identity upserts and writes preserve one revision/task; tenant identity stays distinct", async () => {
  const { db, r } = await setup();
  try {
    const observations = await Promise.all(
      Array.from({ length: 8 }, () =>
        r.observeMany([ref, ref], "2026-01-01T00:00:00Z"),
      ),
    );
    // Even a concurrent insertion invisible to the statement snapshot must remain
    // eligible for claim; identical retries must not depend on another worker finishing.
    assert.ok(observations.every((items) => items.length === 1));
    await Promise.all(
      Array.from({ length: 8 }, () => r.save(snapshot("2026-01-01T00:00:01Z"))),
    );
    assert.equal(await r.count("source_postings"), 1);
    assert.equal(await r.count("posting_revisions"), 1);
    assert.equal(await r.count("analysis_tasks"), 1);
    await Promise.all([
      r.save(snapshot("2026-01-03T00:00:00Z", "newest")),
      r.save(snapshot("2026-01-02T00:00:00Z", "older")),
    ]);
    assert.equal((await r.get(ref))?.fields.bodyText, "newest");
    await r.save({
      ...snapshot("2026-01-01T00:00:00Z"),
      ref: { ...ref, tenantKey: "another" },
    });
    assert.equal(await r.count("source_postings"), 2);
  } finally {
    await db.close();
  }
});
test("Only one scraper claims a posting; an expired worker cannot save or fail its replacement", async () => {
  const { db, r } = await setup();
  try {
    await r.observe(ref, "2026-01-01T00:00:00Z");
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => r.claim(ref)),
    );
    const first = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1);
    await db.query(
      `UPDATE ${db.schema}.source_postings SET lease_until=now()-interval '1 second'`,
    );
    const second = (await r.claim(ref))!;
    assert.notEqual(first.token, second.token);
    assert.equal(
      await r.save(snapshot("2026-01-02T00:00:00Z", "old worker"), first.token),
      "stale",
    );
    await r.failure(ref, "2026-01-03T00:00:00Z", "old failure", first.token);
    assert.equal(
      await r.save(
        snapshot("2026-01-02T00:00:00Z", "replacement"),
        second.token,
      ),
      "created",
    );
    assert.equal((await r.get(ref))?.fields.bodyText, "replacement");
  } finally {
    await db.close();
  }
});
test("Analysis claims are exclusive, inputs are immutable revisions, retries and completion are fenced", async () => {
  const { db, r } = await setup();
  const q = new AnalysisRepository(db);
  try {
    await r.save(snapshot("2026-01-01T00:00:00Z"));
    const batches = await Promise.all([q.claim(1), q.claim(1)]);
    const first = batches.flat()[0];
    assert.equal(batches.flat().length, 1);
    await r.save(snapshot("2026-01-02T00:00:00Z", "changed"));
    assert.equal(first.fields.bodyText, "first");
    await db.query(
      `UPDATE ${db.schema}.analysis_tasks SET lease_until=now()-interval '1 second' WHERE id=$1`,
      [first.id],
    );
    const retry = (await q.claim(1))[0];
    assert.equal(retry.id, first.id);
    assert.equal(retry.attempts, 2);
    assert.equal(
      await q.complete(first.id, first.token, { summary: "stale" }),
      false,
    );
    assert.equal(
      await q.complete(retry.id, retry.token, { summary: "valid" }),
      true,
    );
    const changed = (await q.claim(1))[0];
    assert.equal(changed.fields.bodyText, "changed");
    assert.equal(await q.fail(changed.id, changed.token, "temporary"), true);
    assert.equal((await q.claim(1)).length, 0);
    await db.query(
      `UPDATE ${db.schema}.analysis_tasks SET available_at=now()-interval '1 second' WHERE id=$1`,
      [changed.id],
    );
    const resumed = (await q.claim(1))[0];
    assert.equal(resumed.attempts, 2);
    assert.equal(
      await q.complete(resumed.id, resumed.token, {
        summary: "changed analyzed",
      }),
      true,
    );
    assert.equal((await q.claim(1)).length, 0);
  } finally {
    await db.close();
  }
});
