import type { Database } from "./client";

export class MaintenanceRepository {
  constructor(private readonly db: Database) {}
  /** Explicit retention only: never deletes postings, revisions or analysis results. */
  async pruneRuns(options: {
    before: string;
    limit?: number;
    execute?: boolean;
  }) {
    const limit = options.limit ?? 500;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Run retention limit must be 1–1000");
    const cutoff = new Date(options.before);
    if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() > Date.now())
      throw new Error("Run retention before must be a valid past timestamp");
    const {
      rows: [result],
    } = await this.db.query<{ eligible: number; deleted: number }>(
      `WITH candidates AS MATERIALIZED (
        SELECT id FROM ${this.db.schema}.ingest_runs
        WHERE status<>'running' AND finished_at<$1::timestamptz
        ORDER BY finished_at,id LIMIT $2 ${options.execute ? "FOR UPDATE SKIP LOCKED" : ""}
      ) ${
        options.execute
          ? `, removed AS (
        DELETE FROM ${this.db.schema}.ingest_runs r USING candidates c WHERE r.id=c.id RETURNING r.id
      ) SELECT count(*)::int AS eligible,count(*)::int AS deleted FROM removed`
          : "SELECT count(*)::int AS eligible,0 AS deleted FROM candidates"
      }`,
      [cutoff.toISOString(), limit],
    );
    return result;
  }
}
