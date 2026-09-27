import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./helpers";
import { importSqlite } from "../../server/db/import-sqlite";
import { compare } from "../../server/ingestion/diff";
const first = "2026-01-01T00:00:00.000Z",
  later = "2026-01-02T00:00:00.000Z";
const ref = {
  source: "incruit" as const,
  id: "1",
  url: "https://example.com/1",
};
function legacy(path: string, changed: boolean) {
  const d = new DatabaseSync(path);
  d.exec(
    readFileSync(
      new URL("../../db/legacy/001_sqlite.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const id of changed ? ["1", "2"] : ["1"]) {
    const versions = id === "1" && changed ? ["one", "two"] : ["one"];
    const fields = (body: string) => ({ title: "Role", bodyText: body });
    d.prepare(
      `INSERT INTO source_postings(source,source_id,ref_json,fields_json,content_hash,revision,first_seen_at,last_observed_at,next_check_at,fetch_state,quality) VALUES('incruit',?,?,?,?,?,?,?,?, 'ok','text')`,
    ).run(
      id,
      JSON.stringify({ ...ref, id }),
      JSON.stringify(fields(versions.at(-1)!)),
      compare({}, fields(versions.at(-1)!)).contentHash,
      versions.length,
      first,
      changed ? later : first,
      later,
    );
    versions.forEach((body, n) => {
      const f = fields(body),
        at = n ? later : first,
        h = compare({}, f).contentHash;
      d.prepare(
        `INSERT INTO posting_revisions(source,source_id,version,observed_at,changed_fields_json,before_json,after_json) VALUES('incruit',?,?,?,?,?,?)`,
      ).run(
        id,
        n + 1,
        at,
        JSON.stringify(["bodyText"]),
        "{}",
        JSON.stringify(f),
      );
      d.prepare(
        `INSERT INTO analysis_tasks(source,source_id,content_hash,revision,input_json,created_at) VALUES('incruit',?,?,?,?,?)`,
      ).run(
        id,
        h,
        n + 1,
        JSON.stringify({
          ref: { ...ref, id },
          fields: f,
          quality: "text",
          issues: [],
        }),
        at,
      );
    });
  }
  d.close();
}
test("SQLite overlap merges without losing revisions, repeat migration is inert after Neon updates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hr-import-"));
  const paths = [join(dir, "a.sqlite"), join(dir, "b.sqlite")];
  legacy(paths[0], false);
  legacy(paths[1], true);
  const { db, r } = await setup();
  try {
    const report = await importSqlite(db, paths);
    assert.equal(report.postings, 2);
    assert.equal(report.revisions, 3);
    assert.equal(report.tasks, 3);
    assert.equal(await r.count("source_postings"), 2);
    assert.equal(await r.count("posting_revisions"), 3);
    assert.equal((await r.get(ref))?.fields.bodyText, "two");
    await r.save({
      ref,
      observedAt: "2026-01-03T00:00:00Z",
      fields: { bodyText: "new Neon data" },
      quality: "text",
      issues: [],
    });
    assert.equal(
      (await importSqlite(db, [...paths].reverse())).alreadyImported,
      true,
    );
    assert.equal((await r.get(ref))?.fields.bodyText, "new Neon data");
    assert.equal(await r.count("posting_revisions"), 4);
    const { rows } = await db.query(
      `SELECT t.content_hash,r.content_hash AS revision_hash FROM ${db.schema}.analysis_tasks t JOIN ${db.schema}.posting_revisions r ON r.posting_id=t.posting_id AND r.version=t.revision`,
    );
    assert.ok(rows.every((row) => row.content_hash === row.revision_hash));
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
