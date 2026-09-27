import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setup } from "./helpers";
import { MaintenanceRepository } from "../../server/db/maintenance";

test("Run retention is preview-only by default, bounded, and preserves running/recent reports and all postings", async () => {
  const { db, r } = await setup();
  try {
    for (const [status, finished] of [
      ["complete", "2026-01-01"],
      ["failed", "2026-01-02"],
      ["partial", "2026-01-03"],
      ["running", null],
      ["complete", "2026-02-01"],
    ])
      await db.query(
        `INSERT INTO ${db.schema}.ingest_runs(id,source,mode,scope,started_at,finished_at,status,report)
      VALUES($1,'incruit','discover','default','2026-01-01',$2,$3,'{}')`,
        [randomUUID(), finished, status],
      );
    await r.observe(
      { source: "incruit", id: "keep", url: "https://example.com/keep" },
      "2026-01-01T00:00:00Z",
    );
    const m = new MaintenanceRepository(db);
    const options = { before: "2026-02-01T00:00:00Z", limit: 2 };
    assert.deepEqual(await m.pruneRuns(options), { eligible: 2, deleted: 0 });
    assert.equal(
      (await db.query(`SELECT count(*)::int n FROM ${db.schema}.ingest_runs`))
        .rows[0].n,
      5,
    );
    assert.deepEqual(await m.pruneRuns({ ...options, execute: true }), {
      eligible: 2,
      deleted: 2,
    });
    assert.deepEqual(await m.pruneRuns({ ...options, execute: true }), {
      eligible: 1,
      deleted: 1,
    });
    assert.deepEqual(await m.pruneRuns({ ...options, execute: true }), {
      eligible: 0,
      deleted: 0,
    });
    assert.deepEqual(
      (
        await db.query(
          `SELECT status FROM ${db.schema}.ingest_runs ORDER BY status`,
        )
      ).rows.map((x) => x.status),
      ["complete", "running"],
    );
    assert.equal(await r.count("source_postings"), 1);
    await assert.rejects(
      () => m.pruneRuns({ ...options, limit: 1001 }),
      /limit/i,
    );
    await assert.rejects(
      () => m.pruneRuns({ ...options, before: "invalid" }),
      /before/i,
    );
    await assert.rejects(
      () => m.pruneRuns({ ...options, before: "2999-01-01T00:00:00Z" }),
      /before/i,
    );
  } finally {
    await db.close();
  }
});
