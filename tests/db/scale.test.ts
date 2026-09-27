import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { setup } from "./helpers";
import { AnalysisRepository } from "../../server/analysis/repository";
import type { PostingRef } from "../../server/ingestion/contracts";

test("10,000 posting batch replay is idempotent; sparse due and pending queues use indexes", async () => {
  const { db, r } = await setup();
  const s = db.schema;
  const count = 10000;
  const start = performance.now();
  const refs: PostingRef[] = Array.from({ length: count }, (_, i) => ({
    source: "incruit",
    id: String(i),
    url: `https://example.com/${i}`,
    title: `fixture ${i}`,
  }));
  try {
    for (let offset = 0; offset < count; offset += 500)
      await r.observeMany(
        refs.slice(offset, offset + 500),
        "2026-01-01T00:00:00Z",
      );
    const insertMs = performance.now() - start;
    const again = performance.now();
    for (let offset = 0; offset < count; offset += 500)
      await r.observeMany(
        refs.slice(offset, offset + 500),
        "2026-01-02T00:00:00Z",
      );
    const replayMs = performance.now() - again;
    assert.equal(await r.count("source_postings"), count);
    assert.equal(await r.count("posting_revisions"), 0);
    const detailStart = performance.now();
    for (let offset = 0; offset < 24; offset += 4)
      await Promise.all(
        refs
          .slice(offset, offset + 4)
          .map((ref) =>
            r.save({
              ref,
              observedAt: "2026-01-02T01:00:00Z",
              fields: {
                title: ref.title,
                bodyText: "synthetic detailed body ".repeat(100),
              },
              quality: "text",
              issues: [],
            }),
          ),
      );
    const detailMs = performance.now() - detailStart;
    await r.save({
      ref: refs[0],
      observedAt: "2026-01-03T01:00:00Z",
      fields: {
        title: refs[0].title,
        bodyText: "synthetic detailed body ".repeat(100),
      },
      quality: "text",
      issues: [],
    });
    assert.equal(await r.count("posting_revisions"), 24);
    assert.equal(await r.count("analysis_tasks"), 24);
    // Fill immutable historical jobs to exercise queue indexes, without 10,000 HTTP/model calls.
    await db.query(`WITH p AS (UPDATE ${s}.source_postings SET revision=1,fields=jsonb_build_object('title',ref->>'title','bodyText','synthetic queue fixture'),content_hash=md5(id::text) WHERE revision=0 RETURNING *)
    INSERT INTO ${s}.posting_revisions(posting_id,version,observed_at,content_hash,changed_fields,fields,quality) SELECT id,1,now(),content_hash,ARRAY['title','bodyText'],fields,'text' FROM p`);
    await db.query(
      `INSERT INTO ${s}.analysis_tasks(posting_id,revision,content_hash) SELECT posting_id,version,content_hash FROM ${s}.posting_revisions ON CONFLICT DO NOTHING`,
    );
    await db.query(
      `UPDATE ${s}.source_postings SET next_check_at=CASE WHEN source_id::int>=9990 THEN now()-interval '1 day' ELSE now()+interval '1 day' END`,
    );
    await db.query(
      `UPDATE ${s}.analysis_tasks SET status='completed',completed_at=now(),result='{}' WHERE posting_id IN (SELECT id FROM ${s}.source_postings WHERE source_id::int<9990)`,
    );
    await db.query(`ANALYZE ${s}.source_postings; ANALYZE ${s}.analysis_tasks`);
    const duePlan = (
      await db.query(
        `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT ref FROM ${s}.source_postings WHERE source='incruit' AND next_check_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_check_at,id LIMIT 10`,
      )
    ).rows[0]["QUERY PLAN"];
    const queuePlan = (
      await db.query(
        `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM ${s}.analysis_tasks WHERE attempts<5 AND ((status='pending' AND available_at<=now()) OR (status='running' AND lease_until<=now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 10`,
      )
    ).rows[0]["QUERY PLAN"];
    assert.match(JSON.stringify(duePlan), /postings_due/);
    assert.match(JSON.stringify(queuePlan), /analysis_pending/);
    const queue = new AnalysisRepository(db);
    const claims = (await Promise.all([queue.claim(5), queue.claim(5)])).flat();
    assert.equal(claims.length, 10);
    assert.equal(new Set(claims.map((x) => x.id)).size, 10);
    const evidence = {
      generatedAt: new Date().toISOString(),
      count,
      batchSize: 500,
      insertMs,
      replayMs,
      detailCount: 24,
      detailMs,
      duePlan,
      queuePlan,
      parallelAnalysisClaims: claims.length,
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/neon-scale.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      JSON.stringify({
        count,
        insertMs,
        replayMs,
        detailMs,
        parallelAnalysisClaims: claims.length,
      }),
    );
  } finally {
    await db.close();
  }
});
