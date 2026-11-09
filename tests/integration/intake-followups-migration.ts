import assert from "node:assert/strict";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261109_120000_intake_followups";
import { databaseFingerprints } from "../helpers/database-fingerprints";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_followups_e2_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const db = new pg.Pool({ connectionString: url.toString(), max: 1 });
const args = { db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateUpArgs;
try {
  const exists = (
    await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='inquiries' AND column_name='follow_ups'",
    )
  ).rowCount;
  const columns = (await databaseFingerprints(db)).map((r) => ({
    ...r,
    columns: r.columns.filter((c) => !["follow_ups", "version_follow_ups"].includes(c)),
  }));
  const before = await databaseFingerprints(db, columns);
  if (exists) await down(args as unknown as MigrateDownArgs);
  await up(args);
  assert.deepEqual(await databaseFingerprints(db, columns), before);
  for (const [table, prefix] of [
    ["inquiries", ""],
    ["providers", ""],
    ["_inquiries_v", "version_"],
    ["_providers_v", "version_"],
  ]) {
    const records = (
      await db.query(`SELECT "${prefix}notes" old,"${prefix}follow_ups" history FROM "${table}"`)
    ).rows;
    for (const r of records)
      assert.deepEqual(
        r.history,
        r.old == null || r.old === "" ? null : [{ id: "legacy", body: r.old, legacy: true }],
      );
  }
  await down(args as unknown as MigrateDownArgs);
  await up(args);
  assert.deepEqual(await databaseFingerprints(db, columns), before);
  console.log(
    `PASS four-column migration and round-trip preserve ${before.length} tables, old notes and every historical version, no fabricated author/time`,
  );
} finally {
  await db.end();
}
