import { randomUUID } from "node:crypto";
import type { Database } from "../db/client";
import type {
  PostingFields,
  PostingRef,
  Quality,
} from "../ingestion/contracts";
export interface AnalysisClaim {
  id: string;
  token: string;
  attempts: number;
  ref: PostingRef;
  fields: Partial<PostingFields>;
  quality: Quality;
  issues: string[];
  revision: number;
  analyzerVersion: string;
}
/** Queue storage only. No model invocation or scheduler runs here. */
export class AnalysisRepository {
  constructor(private readonly db: Database) {}
  async claim(limit = 1): Promise<AnalysisClaim[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("Analysis claim limit must be 1–20");
    const s = this.db.schema,
      token = randomUUID();
    const { rows } = await this.db.query(
      `WITH expired AS MATERIALIZED (
    SELECT id,attempts FROM ${s}.analysis_tasks WHERE status='running' AND lease_until<=now()
    ORDER BY lease_until,id LIMIT $1 FOR UPDATE SKIP LOCKED
   ), exhausted AS (
    UPDATE ${s}.analysis_tasks t SET status='failed',lease_token=NULL,lease_until=NULL,last_error='Worker lease expired after 5 attempts'
    FROM expired e WHERE t.id=e.id AND e.attempts>=5
   ), pending AS MATERIALIZED (
    SELECT id FROM ${s}.analysis_tasks WHERE status='pending' AND available_at<=now() AND attempts<5
    ORDER BY available_at,id LIMIT ($1-(SELECT count(*) FROM expired WHERE attempts<5)) FOR UPDATE SKIP LOCKED
   ), candidates AS (
    SELECT id FROM expired WHERE attempts<5 UNION ALL SELECT id FROM pending
    -- Explicit bound also keeps the UPDATE planner from estimating a backlog-sized join.
    LIMIT $1
   ), claimed AS (
    UPDATE ${s}.analysis_tasks t SET status='running',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '15 minutes'
    FROM candidates c WHERE t.id=c.id RETURNING t.*
   ) SELECT t.id,t.lease_token AS token,t.attempts,t.revision,t.analyzer_version AS "analyzerVersion",
      p.ref,r.fields,r.quality,r.issues FROM claimed t
      JOIN ${s}.source_postings p ON p.id=t.posting_id
      JOIN ${s}.posting_revisions r ON r.posting_id=t.posting_id AND r.version=t.revision`,
      [limit, token],
    );
    return rows as AnalysisClaim[];
  }
  async complete(id: string, token: string, result: unknown): Promise<boolean> {
    if (result === undefined) throw new Error("Analysis result is required");
    const { rowCount } = await this.db.query(
      `UPDATE ${this.db.schema}.analysis_tasks SET status='completed',result=$3,completed_at=now(),
    lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()`,
      [id, token, JSON.stringify(result)],
    );
    return rowCount === 1;
  }
  async fail(id: string, token: string, error: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE ${this.db.schema}.analysis_tasks SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
    available_at=now()+LEAST(3600,60*power(2,attempts-1))*interval '1 second',last_error=$3,lease_token=NULL,lease_until=NULL
    WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()`,
      [id, token, error.slice(0, 2000)],
    );
    return rowCount === 1;
  }
}
