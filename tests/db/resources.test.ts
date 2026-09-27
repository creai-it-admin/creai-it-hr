import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setup } from "./helpers";
import { Repository } from "../../server/ingestion/repository";
import { AnalysisRepository } from "../../server/analysis/repository";
import type { Database } from "../../server/db/client";
import type { Snapshot } from "../../server/ingestion/contracts";

const at = "2026-01-01T00:00:00Z";
const ref = {
  source: "incruit" as const,
  id: "resource",
  url: "https://example.com/resource",
  title: "role",
};
const snapshot: Snapshot = {
  ref,
  observedAt: at,
  fields: { title: "role", bodyText: "original" },
  quality: "text",
  issues: [],
};

test("Identical list replay does not rewrite tuples, but due items and exact later sightings are retained", async () => {
  const { db, r } = await setup();
  try {
    await r.observeMany([ref], at);
    const before = (
      await db.query(
        `SELECT xmin::text,ctid::text FROM ${db.schema}.source_postings`,
      )
    ).rows;
    assert.deepEqual(await r.observeMany([ref, ref], at), [ref]);
    assert.deepEqual(
      (
        await db.query(
          `SELECT xmin::text,ctid::text FROM ${db.schema}.source_postings`,
        )
      ).rows,
      before,
    );
    await r.save(snapshot);
    assert.deepEqual(await r.observeMany([ref], at), []);
    const later = "2026-01-01T00:03:00Z";
    assert.deepEqual(await r.observeMany([ref], later), []);
    assert.equal(
      (
        await db.query(
          `SELECT last_seen_in_list_at FROM ${db.schema}.source_postings`,
        )
      ).rows[0].last_seen_in_list_at.toISOString(),
      "2026-01-01T00:03:00.000Z",
    );
    const changed = { ...ref, title: "edited role" };
    assert.deepEqual(await r.observeMany([changed], later), [changed]);
    assert.deepEqual(await r.observeMany([ref], at), []);
    assert.equal((await r.get(ref))!.ref.title, "edited role");
  } finally {
    await db.close();
  }
});

test("Claimed saves use one read and one atomic write; failure uses one statement without recreating missing records", async () => {
  const { db, r } = await setup();
  let queries = 0,
    transactions = 0;
  // Count actual round trips, while all statements still run against Neon.
  const watched = new Proxy(db, {
    get(target, key) {
      if (key === "query")
        return (...args: Parameters<Database["query"]>) => {
          queries++;
          return target.query(...args);
        };
      if (key === "transaction")
        return (fn: Parameters<Database["transaction"]>[0]) => {
          transactions++;
          return target.transaction((client) =>
            fn(
              new Proxy(client, {
                get(c, k) {
                  if (k === "query")
                    return (...args: Parameters<Database["query"]>) => {
                      queries++;
                      return c.query(...args);
                    };
                  return Reflect.get(c, k);
                },
              }),
            ),
          );
        };
      return Reflect.get(target, key);
    },
  });
  const optimized = new Repository(watched);
  try {
    await r.observe(ref, at);
    const claim = (await r.claim(ref))!;
    assert.equal(await optimized.save(snapshot, claim.token), "created");
    assert.equal(transactions, 1);
    assert.ok(
      queries <= 2,
      `claimed save used ${queries} SQL statements inside the transaction`,
    );
    const next = (await r.claim(ref, true))!;
    queries = transactions = 0;
    await optimized.failure(ref, "2026-01-02T00:00:00Z", "timeout", next.token);
    assert.equal(queries, 1);
    assert.equal(transactions, 0);
    assert.equal((await r.get(ref))!.fields.bodyText, "original");
    const missing = { ...ref, id: "missing" };
    await optimized.failure(missing, at, "expired worker", randomUUID());
    assert.equal(
      await optimized.save({ ...snapshot, ref: missing }, randomUUID()),
      "stale",
    );
    assert.equal(await r.get(missing), undefined);
  } finally {
    await db.close();
  }
});

async function seedQueue(db: Database, count: number) {
  const s = db.schema;
  await db.query(
    `WITH p AS (
    INSERT INTO ${s}.source_postings(source,source_id,ref,fields,revision,content_hash,first_seen_at,next_check_at)
    SELECT 'incruit',i::text,jsonb_build_object('source','incruit','id',i::text,'url','https://example.com/'||i),
      '{"title":"fixture"}'::jsonb,1,md5(i::text),now(),now() FROM generate_series(1,$1::int) i RETURNING *
  ), r AS (
    INSERT INTO ${s}.posting_revisions(posting_id,version,observed_at,content_hash,changed_fields,fields,quality)
    SELECT id,1,now(),content_hash,ARRAY['title'],fields,'text' FROM p RETURNING *
  ) INSERT INTO ${s}.analysis_tasks(posting_id,revision,content_hash) SELECT posting_id,version,content_hash FROM r`,
    [count],
  );
}

test("A small claim has bounded expiry cleanup even when thousands of workers have expired", async () => {
  const { db } = await setup();
  try {
    await seedQueue(db, 1001);
    await db.query(
      `UPDATE ${db.schema}.analysis_tasks SET status='running',attempts=5,lease_token=$1,lease_until=now()-interval '1 hour' WHERE id IN (SELECT id FROM ${db.schema}.analysis_tasks ORDER BY id LIMIT 1000)`,
      [randomUUID()],
    );
    const claims = await new AnalysisRepository(db).claim(1);
    assert.equal(claims.length, 1);
    const reaped = (
      await db.query(
        `SELECT count(*)::int n FROM ${db.schema}.analysis_tasks WHERE status='failed'`,
      )
    ).rows[0].n;
    assert.ok(
      reaped > 0 && reaped <= 1,
      `claim(1) cleaned ${reaped} expired tasks`,
    );
  } finally {
    await db.close();
  }
});

type Plan = { [key: string]: unknown; Plans?: Plan[] };
function nodes(plan: Plan): Plan[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

test("Dense pending queues select a small batch without scanning or sorting the full backlog", async () => {
  const { db } = await setup();
  let sql = "",
    values: unknown[] | undefined;
  const watched = new Proxy(db, {
    get(target, key) {
      if (key === "query")
        return (...args: Parameters<Database["query"]>) => {
          [sql, values] = args;
          return target.query(...args);
        };
      return Reflect.get(target, key);
    },
  });
  try {
    await seedQueue(db, 10000);
    await db.query(
      `ANALYZE ${db.schema}.analysis_tasks; ANALYZE ${db.schema}.source_postings; ANALYZE ${db.schema}.posting_revisions`,
    );
    assert.equal((await new AnalysisRepository(watched).claim(5)).length, 5);
    const result = await db.query(
      `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,
      values,
    );
    const plan = result.rows[0]["QUERY PLAN"][0].Plan as Plan;
    const scans = nodes(plan).filter(
      (p) =>
        p["Relation Name"] === "analysis_tasks" &&
        /Scan/.test(String(p["Node Type"])),
    );
    assert.ok(scans.length > 0);
    assert.ok(
      scans.every(
        (p) =>
          Number(p["Actual Rows"]) * Number(p["Actual Loops"]) <= 20 &&
          Number(p["Rows Removed by Filter"] ?? 0) <= 20,
      ),
      JSON.stringify(scans),
    );
  } finally {
    await db.close();
  }
});
