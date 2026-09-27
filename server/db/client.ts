import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "@neondatabase/serverless";

export class Database {
  readonly schema: string;
  private readonly pool: Pool;
  constructor(options: { schema?: string; url?: string } = {}) {
    this.schema = options.schema ?? "hr";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(this.schema))
      throw new Error("Invalid database schema");
    const url = options.url ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    this.pool = new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 10000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
    });
    this.pool.on("error", (error: Error) =>
      console.error("Idle database connection failed:", error.name),
    );
  }
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ) {
    return this.pool.query<R>(sql, values);
  }
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async migrate() {
    const dir = new URL("../../db/migrations/", import.meta.url);
    await this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${this.schema}:migrations`,
      ]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      // SET LOCAL lasts for this transaction, even behind PgBouncer transaction pooling.
      await client.query(`SET LOCAL search_path TO ${this.schema}, pg_catalog`);
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      for (const name of readdirSync(dir)
        .filter((x) => /^\d+.*\.sql$/.test(x))
        .sort()) {
        const sql = readFileSync(new URL(name, dir), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const existing = await client.query(
          "SELECT checksum FROM schema_migrations WHERE name=$1",
          [name],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].checksum !== checksum)
            throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
      }
    });
  }
  close() {
    return this.pool.end();
  }
}
export function openDatabase(options?: { schema?: string; url?: string }) {
  return new Database(options);
}
