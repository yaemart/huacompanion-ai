import assert from "node:assert/strict";
import pg from "pg";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { down, up } from "../../src/migrations/20261113_100000_quote_line_foundation";
import { databaseFingerprints } from "../helpers/database-fingerprints";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const args = { db: { execute: (statement: string) => db.query(statement) } };
const migrate = () => up(args as unknown as MigrateUpArgs);
const rollback = () => down(args as unknown as MigrateDownArgs);
try {
  await db.query("BEGIN");
  if ((await db.query("SELECT to_regclass('public.service_quote_line_costs') name")).rows[0].name)
    await rollback();
  const before = await databaseFingerprints(db);
  await migrate();
  assert.deepEqual(await databaseFingerprints(db, before), before);
  const formats = await db.query(
    "SELECT count(*)::int AS count FROM service_quotes WHERE line_format IS NOT NULL",
  );
  assert.equal(formats.rows[0].count, 0);
  await rollback();
  assert.deepEqual(await databaseFingerprints(db), before);
  await migrate();
  assert.deepEqual(await databaseFingerprints(db, before), before);
  await db.query("COMMIT");
  console.log(
    `PASS additive quote line migration and empty rollback preserve ${before.length} old tables`,
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
