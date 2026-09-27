import { loadEnvConfig } from "@next/env";
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase } from "../server/db/client";
import { Repository } from "../server/ingestion/repository";
import { discover } from "../server/ingestion/discover";
import { refresh } from "../server/ingestion/refresh";
import {
  createAdapter,
  sourceNames,
} from "../server/ingestion/sources/registry";
import type { Source } from "../server/ingestion/contracts";
async function main() {
  loadEnvConfig(process.cwd(), true);
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      mode: { type: "string", default: "discover" },
      scope: { type: "string" },
      "max-pages": { type: "string", default: "2" },
      "max-details": { type: "string", default: "10" },
      ids: { type: "string" },
      report: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      "Usage: npm run ingest -- --source saramin|jobkorea|incruit|all [--mode discover|refresh] [--scope intern] [--max-pages 2] [--max-details 10] [--ids id1,id2] [--report artifacts/run.json]\nExit: 0 complete; 2 partial (including budget-limited runs); 1 failed/invalid. No scheduler or LLM calls.",
    );
    return;
  }
  if (
    !values.source ||
    (!sourceNames.includes(values.source as Source) && values.source !== "all")
  )
    throw new Error("Unknown source");
  if (!["discover", "refresh"].includes(values.mode))
    throw new Error("Invalid mode");
  const maxPages = Number(values["max-pages"]),
    maxDetails = Number(values["max-details"]);
  if (
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    !Number.isSafeInteger(maxDetails) ||
    maxDetails < (values.mode === "refresh" ? 1 : 0)
  )
    throw new Error("Invalid request budget");
  if (values.source === "all" && values.scope)
    throw new Error("Invalid scope: choose one source");
  if (values.ids && values.mode !== "refresh")
    throw new Error("Invalid ids: use refresh mode");
  const ids = values.ids?.split(",");
  if (ids?.some((x) => !/^\d+$/.test(x)))
    throw new Error("Invalid posting IDs");
  const sources =
    values.source === "all" ? sourceNames : [values.source as Source];
  const adapters = sources.map((source) =>
    createAdapter(source, { scope: values.scope }),
  );
  const db = openDatabase(),
    repo = new Repository(db),
    reports = [];
  try {
    for (const adapter of adapters) {
      try {
        reports.push(
          values.mode === "discover"
            ? await discover(adapter, repo, { maxPages, maxDetails })
            : await refresh(adapter, repo, { maxDetails, ids }),
        );
      } finally {
        await adapter.close();
      }
    }
    const output = {
      generatedAt: new Date().toISOString(),
      database: "Neon PostgreSQL / hr",
      reports,
    };
    const json = JSON.stringify(output, null, 2);
    console.log(json);
    if (values.report) {
      mkdirSync(dirname(resolve(values.report)), { recursive: true });
      writeFileSync(resolve(values.report), json + "\n");
    }
    process.exitCode = reports.some((r) => r.status === "failed")
      ? 1
      : reports.some((r) => r.status === "partial")
        ? 2
        : 0;
  } finally {
    await Promise.allSettled(adapters.map((a) => a.close()));
    await db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
