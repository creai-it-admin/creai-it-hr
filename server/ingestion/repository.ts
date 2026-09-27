import { randomUUID } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import type { Database } from "../db/client";
import type {
  PostingFields,
  PostingRef,
  RunReport,
  Snapshot,
  Source,
} from "./contracts";
import { compare, hash, nextCheck } from "./diff";
export type PostingClaim = { ref: PostingRef; token: string };
const identity = (ref: PostingRef) => [ref.source, ref.tenantKey ?? "", ref.id];
export class Repository {
  private readonly s: string;
  constructor(private readonly db: Database) {
    this.s = db.schema;
  }
  async get(ref: PostingRef) {
    const {
      rows: [r],
    } = await this.db.query(
      `SELECT ref,fields,fetch_state,revision,next_check_at FROM ${this.s}.source_postings WHERE source=$1 AND tenant_key=$2 AND source_id=$3`,
      identity(ref),
    );
    return r
      ? {
          ref: r.ref as PostingRef,
          fields: r.fields as Partial<PostingFields>,
          fetchState: r.fetch_state as string,
          revision: r.revision as number,
          nextCheckAt: r.next_check_at.toISOString() as string,
        }
      : undefined;
  }
  async observeMany(refs: PostingRef[], at: string): Promise<PostingRef[]> {
    if (!refs.length) return [];
    const unique = [
      ...new Map(
        refs.map((ref) => [JSON.stringify(identity(ref)), ref]),
      ).values(),
    ];
    const input = unique.map((ref) => ({
      source: ref.source,
      tenant_key: ref.tenantKey ?? "",
      source_id: ref.id,
      ref,
      listing_hash: hash({
        title: ref.title,
        company: ref.company,
        hints: ref.hints,
      }),
    }));
    const { rows } = await this.db.query(
      `WITH input AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset($1::jsonb)
          AS x(source text,tenant_key text,source_id text,ref jsonb,listing_hash text)
      ), observed AS MATERIALIZED (
        SELECT x.*,p.id,p.last_seen_in_list_at,p.next_check_at,
          p.listing_hash AS old_hash,p.ref AS old_ref
        FROM input x LEFT JOIN ${this.s}.source_postings p USING(source,tenant_key,source_id)
      ), written AS (
      INSERT INTO ${this.s}.source_postings AS p
      (source,tenant_key,source_id,ref,listing_hash,first_seen_at,last_seen_in_list_at,next_check_at)
      SELECT source,tenant_key,source_id,ref,listing_hash,$2,$2,$2 FROM observed
      WHERE last_seen_in_list_at IS NULL OR last_seen_in_list_at<$2::timestamptz
        OR (last_seen_in_list_at=$2::timestamptz AND (old_hash IS DISTINCT FROM listing_hash OR old_ref IS DISTINCT FROM ref))
      ORDER BY source,tenant_key,source_id
      ON CONFLICT(source,tenant_key,source_id) DO UPDATE SET
        ref=EXCLUDED.ref,listing_hash=EXCLUDED.listing_hash,last_seen_in_list_at=EXCLUDED.last_seen_in_list_at,
        next_check_at=CASE WHEN p.listing_hash IS DISTINCT FROM EXCLUDED.listing_hash THEN LEAST(p.next_check_at,EXCLUDED.next_check_at) ELSE p.next_check_at END
      WHERE p.last_seen_in_list_at IS NULL OR p.last_seen_in_list_at < EXCLUDED.last_seen_in_list_at
        OR (p.last_seen_in_list_at=EXCLUDED.last_seen_in_list_at
          AND (p.listing_hash IS DISTINCT FROM EXCLUDED.listing_hash OR p.ref IS DISTINCT FROM EXCLUDED.ref))
      RETURNING source,tenant_key,source_id,next_check_at
      ) SELECT o.ref FROM observed o LEFT JOIN written w USING(source,tenant_key,source_id)
      WHERE (w.source_id IS NOT NULL AND w.next_check_at<=$2::timestamptz)
        OR (w.source_id IS NULL AND (o.id IS NULL OR
          ((o.last_seen_in_list_at IS NULL OR o.last_seen_in_list_at<=$2::timestamptz) AND o.next_check_at<=$2::timestamptz)))`,
      [JSON.stringify(input), at],
    );
    // A concurrent insert may be invisible to the statement snapshot. Return that
    // candidate too; claim() rechecks the current due time and lease atomically.
    return rows.map((r) => r.ref as PostingRef);
  }
  async observe(ref: PostingRef, at: string) {
    return (await this.observeMany([ref], at)).length > 0;
  }
  private async insert(client: PoolClient, ref: PostingRef, at: string) {
    await client.query(
      `INSERT INTO ${this.s}.source_postings(source,tenant_key,source_id,ref,first_seen_at,next_check_at)
      VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(source,tenant_key,source_id) DO NOTHING`,
      [...identity(ref), JSON.stringify(ref), at],
    );
  }
  async save(
    snapshot: Snapshot,
    token?: string,
  ): Promise<"created" | "changed" | "unchanged" | "stale"> {
    return this.db.transaction(async (client) => {
      const { ref, observedAt: at } = snapshot;
      if (!token) await this.insert(client, ref, at);
      const {
        rows: [row],
      } = await client.query(
        `SELECT id,fields,revision,last_observed_at,lease_token,lease_until>now() AS lease_active
        FROM ${this.s}.source_postings WHERE source=$1 AND tenant_key=$2 AND source_id=$3 FOR UPDATE`,
        identity(ref),
      );
      if (!row) return "stale";
      if (
        token
          ? row.lease_token !== token || !row.lease_active
          : row.lease_token && row.lease_active
      )
        return "stale";
      if (row.last_observed_at && row.last_observed_at >= new Date(at)) {
        if (token)
          await client.query(
            `UPDATE ${this.s}.source_postings SET lease_token=NULL,lease_until=NULL WHERE id=$1`,
            [row.id],
          );
        return "stale";
      }
      const d = compare(row.fields, snapshot.fields);
      if (!d.fields.title)
        throw new Error("Cannot persist a detail without a title");
      const created = row.revision === 0,
        changed = created || d.changed.length > 0,
        version = row.revision + (changed ? 1 : 0);
      const partial =
        snapshot.quality === "unavailable" ||
        snapshot.issues.some((x) => x.startsWith("asset_"));
      await client.query(
        `WITH updated AS (
        UPDATE ${this.s}.source_postings SET fields=COALESCE($2::jsonb,fields),content_hash=$3,revision=$4,last_observed_at=$5,
        last_detail_verified_at=CASE WHEN $6 THEN last_detail_verified_at ELSE $5 END,fetch_state=$7,quality=$8,issues=$9,
        next_check_at=$10,failures=0,lease_token=NULL,lease_until=NULL WHERE id=$1
        RETURNING id,revision,last_observed_at,content_hash,fields,quality,issues
        ), version AS (
          INSERT INTO ${this.s}.posting_revisions(posting_id,version,observed_at,content_hash,changed_fields,fields,quality,issues)
          SELECT id,revision,last_observed_at,content_hash,$11::text[],fields,quality,issues FROM updated WHERE $12
          RETURNING posting_id,version,content_hash,observed_at
        ) INSERT INTO ${this.s}.analysis_tasks(posting_id,revision,content_hash,created_at)
          SELECT posting_id,version,content_hash,observed_at FROM version WHERE $13
          ON CONFLICT(posting_id,content_hash,analyzer_version) DO NOTHING`,
        [
          row.id,
          changed ? JSON.stringify(d.fields) : null,
          d.contentHash,
          version,
          at,
          partial,
          partial ? "partial" : "ok",
          snapshot.quality,
          JSON.stringify(snapshot.issues),
          nextCheck(d.fields, at, partial),
          d.changed,
          changed,
          created || d.analysisChanged,
        ],
      );
      return created ? "created" : changed ? "changed" : "unchanged";
    });
  }
  async failure(ref: PostingRef, at: string, message: string, token?: string) {
    const update = (client: Pick<Database, "query">) =>
      client.query(
        `UPDATE ${this.s}.source_postings SET last_observed_at=$4,fetch_state='failed',issues=$5,
        next_check_at=$4::timestamptz+LEAST(21600,60*power(2,LEAST(failures,8)))*interval '1 second',
        failures=failures+1,lease_token=NULL,lease_until=NULL
        WHERE source=$1 AND tenant_key=$2 AND source_id=$3 AND (last_observed_at IS NULL OR last_observed_at<$4)
        AND (($6::uuid IS NOT NULL AND lease_token=$6 AND lease_until>now()) OR ($6 IS NULL AND (lease_token IS NULL OR lease_until<=now())))`,
        [
          ...identity(ref),
          at,
          JSON.stringify([message.slice(0, 2000)]),
          token ?? null,
        ],
      );
    // Claims only exist for persisted postings; a single fenced UPDATE is atomic.
    if (token) {
      await update(this.db);
      return;
    }
    await this.db.transaction(async (client) => {
      await this.insert(client, ref, at);
      await update(client);
    });
  }
  async due(source: Source, now: string, limit: number): Promise<PostingRef[]> {
    const { rows } = await this.db.query(
      `SELECT ref FROM ${this.s}.source_postings WHERE source=$1 AND next_check_at<=$2 AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_check_at,id LIMIT $3`,
      [source, now, limit],
    );
    return rows.map((r) => r.ref);
  }
  async refs(source: Source, ids: string[]): Promise<PostingRef[]> {
    const { rows } = await this.db.query(
      `SELECT ref FROM ${this.s}.source_postings WHERE source=$1 AND tenant_key='' AND source_id=ANY($2::text[]) ORDER BY source_id`,
      [source, ids],
    );
    return rows.map((r) => r.ref);
  }
  async claim(
    ref: PostingRef,
    force = false,
  ): Promise<PostingClaim | undefined> {
    const token = randomUUID();
    const { rows } = await this.db.query(
      `WITH candidate AS (
      SELECT id FROM ${this.s}.source_postings WHERE source=$1 AND tenant_key=$2 AND source_id=$3
      AND ($4 OR next_check_at<=now()) AND (lease_until IS NULL OR lease_until<=now()) FOR UPDATE SKIP LOCKED)
      UPDATE ${this.s}.source_postings p SET lease_token=$5,lease_until=now()+interval '30 minutes'
      FROM candidate c WHERE p.id=c.id RETURNING p.ref`,
      [...identity(ref), force, token],
    );
    return rows[0] ? { ref: rows[0].ref, token } : undefined;
  }
  async count(
    table: "source_postings" | "posting_revisions" | "analysis_tasks",
  ) {
    const {
      rows: [{ n }],
    } = await this.db.query(`SELECT count(*) AS n FROM ${this.s}.${table}`);
    return Number(n);
  }
  async startRun(report: RunReport, at: string) {
    await this.db.query(
      `INSERT INTO ${this.s}.ingest_runs(id,source,mode,scope,started_at,status,report) VALUES($1,$2,$3,$4,$5,'running',$6)`,
      [
        report.id,
        report.source,
        report.mode,
        report.scope,
        at,
        JSON.stringify(report),
      ],
    );
  }
  async finishRun(report: RunReport, at: string) {
    await this.db.query(
      `UPDATE ${this.s}.ingest_runs SET status=$2,finished_at=$3,report=$4 WHERE id=$1`,
      [report.id, report.status, at, JSON.stringify(report)],
    );
  }
}
