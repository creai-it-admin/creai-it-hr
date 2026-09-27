import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("CLI rejects invalid sources and budgets before opening a browser or database", () => {
  for (const args of [
    ["--source", "wrong"],
    ["--source", "incruit", "--max-pages=-1"],
    ["--source", "incruit", "--mode", "refresh", "--max-details", "0"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/ingest.ts", ...args],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid|Unknown/);
  }
});
