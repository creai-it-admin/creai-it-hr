import { loadEnvConfig } from "@next/env";
import { openDatabase } from "../server/db/client";
async function main() {
  loadEnvConfig(process.cwd(), true);
  const db = openDatabase();
  try {
    await db.migrate();
    console.log("Neon hr schema migrations applied.");
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
