import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { Database } from "./client";
import { hash, compare } from "../ingestion/diff";
import type {
  PostingFields,
  PostingRef,
  Quality,
} from "../ingestion/contracts";
interface LegacyPosting {
  source: string;
  tenant_key: string;
  source_id: string;
  ref_json: string;
  fields_json: string;
  listing_hash: string | null;
  content_hash: string | null;
  revision: number;
  first_seen_at: string;
  last_seen_in_list_at: string | null;
  last_observed_at: string | null;
  last_detail_verified_at: string | null;
  fetch_state: string;
  quality: Quality;
  issues_json: string;
  next_check_at: string;
  failures: number;
}
interface LegacyRevision {
  version: number;
  observed_at: string;
  after_json: string;
  changed_fields_json: string;
}
interface LegacyTask {
  revision: number;
  content_hash: string;
  input_json: string;
  status: string;
  created_at: string;
}
interface LegacyRun {
  id: string;
  source: string;
  mode: string;
  scope: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  report_json: string;
}
interface Entry {
  file: number;
  row: LegacyPosting;
  revisions: LegacyRevision[];
  tasks: LegacyTask[];
}
interface Revision {
  version: number;
  observed_at: string;
  content_hash: string;
  changed_fields: string[];
  fields: Partial<PostingFields>;
  quality: Quality;
  issues: string[];
}
const key = (r: { source: string; tenant_key: string; source_id: string }) =>
  JSON.stringify([r.source, r.tenant_key, r.source_id]);
function merge(entries: Entry[]) {
  const ordered = [...entries].sort((a, b) =>
    (a.row.last_observed_at ?? a.row.first_seen_at).localeCompare(
      b.row.last_observed_at ?? b.row.first_seen_at,
    ),
  );
  const details = ordered.filter((e) => e.row.last_observed_at);
  const latest = (details.at(-1) ?? ordered.at(-1))!.row;
  if (
    details.some(
      (e) =>
        e.row.last_observed_at === latest.last_observed_at &&
        hash(JSON.parse(e.row.fields_json)) !==
          hash(JSON.parse(latest.fields_json)),
    )
  )
    throw new Error(`Conflicting latest SQLite observations: ${key(latest)}`);
  const list = [...entries]
    .sort((a, b) =>
      (a.row.last_seen_in_list_at ?? "").localeCompare(
        b.row.last_seen_in_list_at ?? "",
      ),
    )
    .at(-1)!.row;
  const revisions: Revision[] = [];
  const mapping = new Map<string, number>();
  const timeline = entries
    .flatMap((e) => e.revisions.map((r) => ({ r, e })))
    .sort(
      (a, b) =>
        a.r.observed_at.localeCompare(b.r.observed_at) ||
        hash(JSON.parse(a.r.after_json)).localeCompare(
          hash(JSON.parse(b.r.after_json)),
        ),
    );
  for (const { r, e } of timeline) {
    const fields = JSON.parse(r.after_json) as Partial<PostingFields>;
    const previous = revisions.at(-1);
    if (
      previous?.observed_at === r.observed_at &&
      hash(previous.fields) !== hash(fields)
    )
      throw new Error(`Conflicting SQLite revision time: ${key(latest)}`);
    if (!previous || hash(previous.fields) !== hash(fields)) {
      const input = e.tasks.find((t) => t.revision === r.version);
      const metadata = input
        ? JSON.parse(input.input_json)
        : r.version === e.row.revision
          ? { quality: e.row.quality, issues: JSON.parse(e.row.issues_json) }
          : {
              quality: "unavailable",
              issues: ["legacy_revision_metadata_unavailable"],
            };
      revisions.push({
        version: revisions.length + 1,
        observed_at: r.observed_at,
        fields,
        content_hash: compare({}, fields).contentHash,
        changed_fields: compare(previous?.fields ?? {}, fields).changed,
        quality: metadata.quality,
        issues: metadata.issues,
      });
    }
    mapping.set(`${e.file}:${r.version}`, revisions.length);
  }
  const fields = JSON.parse(latest.fields_json) as Partial<PostingFields>;
  if (revisions.length && hash(revisions.at(-1)!.fields) !== hash(fields))
    throw new Error(
      `SQLite latest fields disagree with history: ${key(latest)}`,
    );
  const tasks = new Map<
    string,
    { revision: number; content_hash: string; created_at: string }
  >();
  for (const e of entries)
    for (const task of e.tasks) {
      if (task.status !== "pending")
        throw new Error(
          "Legacy import requires pending-only analysis tasks; preserve other statuses explicitly before importing",
        );
      const revision = mapping.get(`${e.file}:${task.revision}`);
      const input = JSON.parse(task.input_json);
      if (
        !revision ||
        revisions[revision - 1].content_hash !== task.content_hash ||
        hash(revisions[revision - 1].fields) !== hash(input.fields)
      )
        throw new Error(
          `SQLite task input disagrees with revision: ${key(latest)}`,
        );
      const prev = tasks.get(task.content_hash);
      if (!prev || task.created_at < prev.created_at)
        tasks.set(task.content_hash, {
          revision,
          content_hash: task.content_hash,
          created_at: task.created_at,
        });
    }
  return {
    source: latest.source,
    tenant_key: latest.tenant_key,
    source_id: latest.source_id,
    ref: JSON.parse(
      list.last_seen_in_list_at ? list.ref_json : latest.ref_json,
    ) as PostingRef,
    fields,
    listing_hash: list.listing_hash,
    content_hash: revisions.length ? compare({}, fields).contentHash : null,
    revision: revisions.length,
    first_seen_at: entries.map((e) => e.row.first_seen_at).sort()[0],
    last_seen_in_list_at: list.last_seen_in_list_at,
    last_observed_at: latest.last_observed_at,
    last_detail_verified_at: latest.last_detail_verified_at,
    fetch_state: latest.fetch_state,
    quality: latest.quality,
    issues: JSON.parse(latest.issues_json),
    next_check_at: [
      latest.next_check_at,
      ...(list.last_seen_in_list_at &&
      list.last_seen_in_list_at > (latest.last_observed_at ?? "")
        ? [list.next_check_at]
        : []),
    ].sort()[0],
    failures: latest.failures,
    revisions,
    tasks: [...tasks.values()].sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        a.content_hash.localeCompare(b.content_hash),
    ),
  };
}

/** One-off, atomic cutover. Originals are never modified; PostgreSQL writes use bounded batches. */
export async function importSqlite(db: Database, paths: string[]) {
  if (!paths.length) throw new Error("At least one SQLite file is required");
  const groups = new Map<string, Entry[]>(),
    runs = new Map<string, LegacyRun>();
  let inputPostings = 0,
    inputRevisions = 0,
    inputTasks = 0;
  for (const [file, path] of [...new Set(paths.map((p) => resolve(p)))]
    .sort()
    .entries()) {
    const sqlite = new DatabaseSync(path, { readOnly: true });
    try {
      sqlite.exec("BEGIN");
      for (const row of sqlite
        .prepare(
          "SELECT * FROM source_postings ORDER BY source,tenant_key,source_id",
        )
        .iterate() as Iterable<unknown>) {
        const r = row as LegacyPosting;
        const id = [r.source, r.tenant_key, r.source_id];
        const revisions = sqlite
          .prepare(
            "SELECT * FROM posting_revisions WHERE source=? AND tenant_key=? AND source_id=? ORDER BY version",
          )
          .all(...id) as unknown as LegacyRevision[];
        const tasks = sqlite
          .prepare(
            "SELECT * FROM analysis_tasks WHERE source=? AND tenant_key=? AND source_id=? ORDER BY created_at",
          )
          .all(...id) as unknown as LegacyTask[];
        const group = groups.get(key(r)) ?? [];
        group.push({ file, row: r, revisions, tasks });
        groups.set(key(r), group);
        inputPostings++;
        inputRevisions += revisions.length;
        inputTasks += tasks.length;
      }
      for (const raw of sqlite
        .prepare("SELECT * FROM ingest_runs ORDER BY id")
        .iterate()) {
        const run = raw as unknown as LegacyRun;
        const old = runs.get(run.id);
        if (old && hash(old) !== hash(run))
          throw new Error(`Conflicting SQLite run ${run.id}`);
        runs.set(run.id, run);
      }
    } finally {
      sqlite.close();
    }
  }
  const postings = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entries]) => merge(entries));
  const runRows = [...runs.values()].sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = hash({ format: 1, postings, runs: runRows }),
    name = `sqlite:${fingerprint}`;
  const report = {
    inputPostings,
    inputRevisions,
    inputTasks,
    postings: postings.length,
    revisions: postings.reduce((n, p) => n + p.revisions.length, 0),
    tasks: postings.reduce((n, p) => n + p.tasks.length, 0),
    runs: runRows.length,
    fingerprint,
    alreadyImported: false,
  };
  return db.transaction(async (client) => {
    const s = db.schema;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${s}:sqlite-import`,
    ]);
    if (
      (
        await client.query(
          `SELECT 1 FROM ${s}.schema_migrations WHERE name=$1`,
          [name],
        )
      ).rowCount
    )
      return { ...report, alreadyImported: true };
    // A cutover import must not silently overwrite records already collected in Neon.
    for (let offset = 0; offset < postings.length; offset += 100) {
      const batch = postings.slice(offset, offset + 100);
      const existing = await client.query(
        `SELECT p.id FROM ${s}.source_postings p JOIN jsonb_to_recordset($1::jsonb) AS x(source text,tenant_key text,source_id text)
    ON p.source=x.source AND p.tenant_key=x.tenant_key AND p.source_id=x.source_id LIMIT 1`,
        [
          JSON.stringify(
            batch.map(({ source, tenant_key, source_id }) => ({
              source,
              tenant_key,
              source_id,
            })),
          ),
        ],
      );
      if (existing.rowCount)
        throw new Error(
          "Import conflicts with existing Neon postings; no rows were changed. Use the same original dataset to resume an already completed migration.",
        );
      const { rows: inserted } = await client.query(
        `INSERT INTO ${s}.source_postings
    (source,tenant_key,source_id,ref,fields,listing_hash,content_hash,revision,first_seen_at,last_seen_in_list_at,last_observed_at,last_detail_verified_at,fetch_state,quality,issues,next_check_at,failures)
    SELECT source,tenant_key,source_id,ref,fields,listing_hash,content_hash,revision,first_seen_at,last_seen_in_list_at,last_observed_at,last_detail_verified_at,fetch_state,quality,issues,next_check_at,failures
    FROM jsonb_to_recordset($1::jsonb) AS x(source text,tenant_key text,source_id text,ref jsonb,fields jsonb,listing_hash text,content_hash text,revision integer,
      first_seen_at timestamptz,last_seen_in_list_at timestamptz,last_observed_at timestamptz,last_detail_verified_at timestamptz,fetch_state text,quality text,issues jsonb,next_check_at timestamptz,failures integer)
    RETURNING id,source,tenant_key,source_id,fields`,
        [
          JSON.stringify(
            batch.map(({ revisions, tasks, ...row }) => {
              void revisions;
              void tasks;
              return row;
            }),
          ),
        ],
      );
      const ids = new Map(
        inserted.map((r) => [
          key(r as { source: string; tenant_key: string; source_id: string }),
          r.id,
        ]),
      );
      for (const p of batch) {
        const actual = inserted.find((r) => key(r as typeof p) === key(p));
        if (!actual || hash(actual.fields) !== hash(p.fields))
          throw new Error("Imported fields mismatch");
      }
      const revisions = batch.flatMap((p) =>
        p.revisions.map((r) => ({ posting_id: ids.get(key(p)), ...r })),
      );
      if (revisions.length)
        await client.query(
          `INSERT INTO ${s}.posting_revisions(posting_id,version,observed_at,content_hash,changed_fields,fields,quality,issues)
    SELECT posting_id,version,observed_at,content_hash,changed_fields,fields,quality,issues FROM jsonb_to_recordset($1::jsonb)
    AS x(posting_id bigint,version integer,observed_at timestamptz,content_hash text,changed_fields text[],fields jsonb,quality text,issues jsonb)`,
          [JSON.stringify(revisions)],
        );
      const tasks = batch.flatMap((p) =>
        p.tasks.map((t) => ({ posting_id: ids.get(key(p)), ...t })),
      );
      if (tasks.length)
        await client.query(
          `INSERT INTO ${s}.analysis_tasks(posting_id,revision,content_hash,created_at)
    SELECT posting_id,revision,content_hash,created_at FROM jsonb_to_recordset($1::jsonb) AS x(posting_id bigint,revision integer,content_hash text,created_at timestamptz)`,
          [JSON.stringify(tasks)],
        );
    }
    for (let offset = 0; offset < runRows.length; offset += 100) {
      await client.query(
        `INSERT INTO ${s}.ingest_runs(id,source,mode,scope,started_at,finished_at,status,report)
    SELECT id,source,mode,scope,started_at,finished_at,status,report FROM jsonb_to_recordset($1::jsonb)
    AS x(id uuid,source text,mode text,scope text,started_at timestamptz,finished_at timestamptz,status text,report jsonb)`,
        [
          JSON.stringify(
            runRows
              .slice(offset, offset + 100)
              .map(({ report_json, ...r }) => ({
                ...r,
                report: JSON.parse(report_json),
              })),
          ),
        ],
      );
    }
    await client.query(
      `INSERT INTO ${s}.schema_migrations(name,checksum) VALUES($1,$2)`,
      [name, fingerprint],
    );
    return report;
  });
}
