import { parseArgs } from "node:util";
import { loadEnvConfig } from "@next/env";
import { openDatabase } from "../server/db/client";
import { MaintenanceRepository } from "../server/db/maintenance";

async function main() {
  const { values } = parseArgs({
    options: {
      before: { type: "string" },
      limit: { type: "string", default: "500" },
      execute: { type: "boolean", default: false },
    },
  });
  if (!values.before)
    throw new Error(
      "Specify --before <ISO timestamp>; preview is the default, --execute deletes one bounded batch.",
    );
  loadEnvConfig(process.cwd(), true);
  const db = openDatabase();
  try {
    const result = await new MaintenanceRepository(db).pruneRuns({
      before: values.before,
      limit: Number(values.limit),
      execute: values.execute,
    });
    console.log(
      JSON.stringify({
        mode: values.execute ? "delete" : "preview",
        ...result,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
