import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { openDatabase } from "../../server/db/client";
import { Repository } from "../../server/ingestion/repository";
loadEnvConfig(process.cwd(), true);
export async function setup() {
  const schema = `hr_test_${randomUUID().replaceAll("-", "")}`;
  const db = openDatabase({ schema });
  await db.migrate();
  const close = db.close.bind(db);
  db.close = async () => {
    try {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await close();
    }
  };
  return { db, r: new Repository(db) };
}
