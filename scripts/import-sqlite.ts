import { loadEnvConfig } from "@next/env";
import { openDatabase } from "../server/db/client";
import { importSqlite } from "../server/db/import-sqlite";
async function main() {
  loadEnvConfig(process.cwd(), true);
  const db = openDatabase();
  try {
    console.log(
      JSON.stringify(await importSqlite(db, process.argv.slice(2)), null, 2),
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
