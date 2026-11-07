import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "55438" ||
  url.pathname !== "/hua_companion"
)
  throw Error("Dedicated local database required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const names = (
    await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  ).rows.map((x) => x.tablename);
  const verified = JSON.parse(readFileSync("backups/last-restore-check.json")).results.map(
    (x) => x.table,
  );
  const missing = names.filter((x) => !verified.includes(x));
  console.log(JSON.stringify({ tables: names.length, missing }));
  assert.deepEqual(missing, [], "Every public table must be verified after restore");
} finally {
  await pool.end();
}
