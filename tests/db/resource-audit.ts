/** Manual, bounded audit against isolated Neon tables. Does not change the hr schema. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import type { QueryResult } from "@neondatabase/serverless";
import { setup } from "./helpers";
import { Repository } from "../../server/ingestion/repository";
import { AnalysisRepository } from "../../server/analysis/repository";
import type { PostingRef } from "../../server/ingestion/contracts";

type Metric = {
  calls: number;
  returnedRows: number;
  returnedJSONBytes: number;
  parameterJSONBytes: number;
  ms: number;
  statements: string[];
};
type Plan = { [key: string]: unknown; Plans?: Plan[] };
const fresh = (): Metric => ({
  calls: 0,
  returnedRows: 0,
  returnedJSONBytes: 0,
  parameterJSONBytes: 0,
  ms: 0,
  statements: [],
});
async function main() {
  const { db } = await setup();
  const s = db.schema;
  let active: Metric | undefined;
  let captured: { sql: string; values: unknown[] } | undefined;
  function traced<T extends object>(target: T): T {
    return new Proxy(target, {
      get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (typeof value !== "function") return value;
        if (key !== "query") return value.bind(object);
        return async (...args: unknown[]) => {
          const result = (await Reflect.apply(
            value,
            object,
            args,
          )) as QueryResult;
          const sql = String(args[0]);
          const values = (args[1] ?? []) as unknown[];
          captured = { sql, values };
          if (active) {
            active.calls++;
            active.returnedRows += result.rows?.length ?? 0;
            active.returnedJSONBytes += Buffer.byteLength(
              JSON.stringify(result.rows ?? []),
            );
            active.parameterJSONBytes += Buffer.byteLength(
              JSON.stringify(values),
            );
            active.statements.push(
              sql.trim().split(/\s+/).slice(0, 3).join(" "),
            );
          }
          return result;
        };
      },
    });
  }
  const monitored = traced(db);
  const originalTransaction = db.transaction.bind(db);
  monitored.transaction = async (fn) => {
    if (active) {
      active.calls++;
      active.statements.push("BEGIN");
    }
    try {
      const result = await originalTransaction((client) => fn(traced(client)));
      if (active) {
        active.calls++;
        active.statements.push("COMMIT");
      }
      return result;
    } catch (error) {
      if (active) {
        active.calls++;
        active.statements.push("ROLLBACK");
      }
      throw error;
    }
  };
  const r = new Repository(monitored),
    q = new AnalysisRepository(monitored);
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    count: 10000,
    synthetic: true,
    productionChanged: false,
  };
  async function measure<T>(fn: () => Promise<T>) {
    const m = fresh();
    active = m;
    const start = performance.now();
    try {
      const result = await fn();
      m.ms = performance.now() - start;
      return { result, metric: m };
    } finally {
      active = undefined;
    }
  }
  async function explain(sql: string, values: unknown[] = []) {
    return (
      await db.query(`EXPLAIN(ANALYZE,BUFFERS,WAL,FORMAT JSON) ${sql}`, values)
    ).rows[0]["QUERY PLAN"];
  }
  function summarize(plan: Plan) {
    const nodes: Record<string, unknown>[] = [];
    function visit(p: Plan) {
      nodes.push(
        Object.fromEntries(
          [
            "Node Type",
            "Relation Name",
            "Index Name",
            "Actual Rows",
            "Actual Loops",
            "Rows Removed by Filter",
            "Rows Removed by Conflict Filter",
            "Tuples Inserted",
            "Conflicting Tuples",
            "Shared Hit Blocks",
            "Shared Read Blocks",
            "WAL Bytes",
            "WAL Records",
            "Sort Method",
            "Sort Space Used",
          ]
            .filter((k) => p[k] !== undefined)
            .map((k) => [k, p[k]]),
        ),
      );
      p.Plans?.forEach(visit);
    }
    visit(plan);
    return nodes;
  }
  try {
    const refs: PostingRef[] = Array.from({ length: 10000 }, (_, i) => ({
      source: "incruit",
      id: String(i + 1),
      url: `https://example.com/audit/${i + 1}`,
      title: `Audit role ${i + 1}`,
      company: "Synthetic",
    }));
    report.initialList = (
      await measure(async () => {
        for (let n = 0; n < refs.length; n += 500)
          await r.observeMany(refs.slice(n, n + 500), "2026-01-01T00:00:00Z");
      })
    ).metric;
    await db.query(
      `UPDATE ${s}.source_postings SET next_check_at=now()+interval '1 day'`,
    );
    const beforeReplay = new Map(
      (
        await db.query(
          `SELECT id,xmin::text,ctid::text FROM ${s}.source_postings`,
        )
      ).rows.map((row) => [row.id, `${row.xmin}:${row.ctid}`]),
    );
    const repeated = await measure(async () => {
      let due = 0;
      for (let n = 0; n < refs.length; n += 500)
        due += (
          await r.observeMany(refs.slice(n, n + 500), "2026-01-01T00:00:00Z")
        ).length;
      return due;
    });
    assert.equal(repeated.result, 0);
    report.identicalList = {
      ...repeated.metric,
      eligibleReturnedByRepository: repeated.result,
      tuplesUpdated: (
        await db.query(
          `SELECT id,xmin::text,ctid::text FROM ${s}.source_postings`,
        )
      ).rows.filter(
        (row) => beforeReplay.get(row.id) !== `${row.xmin}:${row.ctid}`,
      ).length,
    };
    const listQuery = captured!;
    report.identicalBatchPlan = await explain(listQuery.sql, listQuery.values);
    report.laterIdenticalList = (
      await measure(async () => {
        for (let n = 0; n < refs.length; n += 500)
          assert.equal(
            (
              await r.observeMany(
                refs.slice(n, n + 500),
                "2026-01-01T00:01:00Z",
              )
            ).length,
            0,
          );
      })
    ).metric;
    const body = Array.from({ length: 300 }, (_, i) =>
      createHash("sha256").update(`synthetic ${i}`).digest("hex"),
    ).join(" ");
    const ref = refs[0];
    await r.save({
      ref,
      observedAt: "2026-01-02T00:00:00Z",
      fields: { title: ref.title, bodyText: body },
      quality: "text",
      issues: [],
    });
    const sequences = [];
    for (let i = 0; i < 3; i++) {
      const sample = await measure(async () => {
        const claim = (await r.claim(ref, true))!;
        return r.save(
          {
            ref,
            observedAt: `2026-01-0${3 + i}T00:00:00Z`,
            fields: { title: ref.title, bodyText: body },
            quality: "text",
            issues: [],
          },
          claim.token,
        );
      });
      assert.equal(sample.result, "unchanged");
      sequences.push(sample.metric);
    }
    report.unchangedDetail = sequences;
    const changed = await measure(async () => {
      const claim = (await r.claim(ref, true))!;
      return r.save(
        {
          ref,
          observedAt: "2026-01-06T00:00:00Z",
          fields: { bodyText: body + " changed" },
          quality: "text",
          issues: [],
        },
        claim.token,
      );
    });
    assert.equal(changed.result, "changed");
    report.changedDetail = changed.metric;
    const failed = await measure(async () => {
      const claim = (await r.claim(ref, true))!;
      return r.failure(
        ref,
        "2026-01-07T00:00:00Z",
        "Synthetic failure",
        claim.token,
      );
    });
    report.failedDetail = failed.metric;
    // Establish realistic backlog sizes cheaply. No model or external source calls.
    await db.query(`WITH p AS (UPDATE ${s}.source_postings SET revision=1,fields=jsonb_build_object('title',ref->>'title','bodyText','synthetic queue body'),content_hash=md5(id::text) WHERE revision=0 RETURNING *)
 INSERT INTO ${s}.posting_revisions(posting_id,version,observed_at,content_hash,changed_fields,fields,quality) SELECT id,1,now(),content_hash,ARRAY['title','bodyText'],fields,'text' FROM p`);
    await db.query(
      `INSERT INTO ${s}.analysis_tasks(posting_id,revision,content_hash) SELECT posting_id,version,content_hash FROM ${s}.posting_revisions ON CONFLICT DO NOTHING`,
    );
    const backlogs = [];
    for (const pending of [10, 1000, 10000]) {
      await db.query(
        `UPDATE ${s}.analysis_tasks t SET status=CASE WHEN x.n<=$1 THEN 'pending' ELSE 'completed' END,
    completed_at=CASE WHEN x.n<=$1 THEN NULL ELSE now() END,lease_token=NULL,lease_until=NULL,attempts=0,available_at=now()-interval '1 minute'
    FROM (SELECT id,row_number() OVER(ORDER BY id) n FROM ${s}.analysis_tasks) x WHERE t.id=x.id`,
        [pending],
      );
      await db.query(`VACUUM(ANALYZE) ${s}.analysis_tasks`);
      const sample = await measure(() => q.claim(5));
      assert.equal(sample.result.length, 5);
      const statement = captured!;
      await db.query(
        `UPDATE ${s}.analysis_tasks SET status='pending',lease_token=NULL,lease_until=NULL,attempts=0 WHERE id=ANY($1::bigint[])`,
        [sample.result.map((x) => x.id)],
      );
      const actualPending = (
        await db.query(
          `SELECT count(*)::int n FROM ${s}.analysis_tasks WHERE status='pending'`,
        )
      ).rows[0].n;
      assert.equal(actualPending, pending);
      const plan = await explain(statement.sql, statement.values);
      backlogs.push({
        pending,
        metric: sample.metric,
        plan,
        summary: summarize(plan[0].Plan),
        executionMs: plan[0]["Execution Time"],
      });
    }
    report.analysisBacklogs = backlogs;
    const originalBodyResult = (
      await db.query(
        `SELECT id,lease_token FROM ${s}.analysis_tasks WHERE status='running' LIMIT 1`,
      )
    ).rows[0];
    report.analysisCompletion = (
      await measure(() =>
        q.complete(originalBodyResult.id, originalBodyResult.lease_token, {
          summary: "Synthetic result",
        }),
      )
    ).metric;
    // The expired-task reaper is part of the same claim SQL; verify how much work a small claim can do.
    await db.query(
      `UPDATE ${s}.analysis_tasks SET status='running',completed_at=NULL,lease_token='00000000-0000-4000-8000-000000000001',lease_until=now()-interval '1 hour',attempts=5 WHERE id IN (SELECT id FROM ${s}.analysis_tasks ORDER BY id LIMIT 1000)`,
    );
    await db.query(`ANALYZE ${s}.analysis_tasks`);
    const expired = await measure(() => q.claim(1));
    const reaped = (
      await db.query(
        `SELECT count(*)::int n FROM ${s}.analysis_tasks WHERE status='failed'`,
      )
    ).rows[0].n;
    assert.equal(reaped, 1);
    report.expiredReaper = {
      requested: 1,
      claimed: expired.result.length,
      failedRowsUpdated: reaped,
      metric: expired.metric,
    };
    // Deletes below only touch this audit's synthetic rows. Operational code has no delete API.
    let parentDeleteCode: string | undefined;
    try {
      await db.query(`DELETE FROM ${s}.source_postings WHERE source_id='1'`);
    } catch (error) {
      parentDeleteCode = (error as { code?: string }).code;
    }
    assert.equal(parentDeleteCode, "23503");
    report.delete = { parentDeleteCode, operationalDeleteImplemented: false };
    const one = (
      await db.query(
        `SELECT id FROM ${s}.source_postings WHERE source_id='9999'`,
      )
    ).rows[0].id;
    report.childFirstDelete = (
      await measure(() =>
        monitored.transaction(async (client) => {
          await client.query(
            `DELETE FROM ${s}.analysis_tasks WHERE posting_id=$1`,
            [one],
          );
          await client.query(
            `DELETE FROM ${s}.posting_revisions WHERE posting_id=$1`,
            [one],
          );
          await client.query(`DELETE FROM ${s}.source_postings WHERE id=$1`, [
            one,
          ]);
        }),
      )
    ).metric;
    report.rowsAtEnd = (
      await db.query(`SELECT count(*)::int n FROM ${s}.source_postings`)
    ).rows[0].n;
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/neon-resource-audit.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          identicalList: report.identicalList,
          unchangedDetail: report.unchangedDetail,
          changedDetail: report.changedDetail,
          backlogs: backlogs.map((x) => ({
            pending: x.pending,
            ms: x.executionMs,
            summary: x.summary,
          })),
          expiredReaper: report.expiredReaper,
          delete: report.delete,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
