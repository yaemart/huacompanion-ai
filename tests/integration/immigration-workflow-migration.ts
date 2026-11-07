import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261101_091015_immigration_policy_workflow";
import { databaseFingerprints } from "../helpers/database-fingerprints";

const source = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  source.hostname !== "127.0.0.1" ||
  source.port !== "55438" ||
  source.pathname !== "/hua_companion"
)
  throw Error("Dedicated local database required");
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@15/bin";
const backup = path.resolve(
  process.env.POLICY_WORKFLOW_BACKUP || ".local/policy-workflow-before/database.dump",
);
if (!existsSync(backup))
  throw Error("Pre-policy-migration backup required; see docs/immigration-policies.md");
const database = `hua_policy_workflow_${randomUUID().replaceAll("-", "")}`;
const env = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port,
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
};
const target = new URL(source);
target.pathname = "/" + database;
execFileSync(bin + "/createdb", [database], { env, stdio: "pipe" });
const pool = new pg.Pool({ connectionString: target.toString(), max: 1 });
try {
  execFileSync(
    bin + "/pg_restore",
    ["--no-owner", "--no-privileges", "--dbname", database, backup],
    { env, stdio: "pipe" },
  );
  const before = await databaseFingerprints(pool);
  const db = { execute: (statement: string) => pool.query(statement) };
  await up({ db } as unknown as MigrateUpArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  const actor = (await pool.query<{ id: number }>("SELECT id FROM staff ORDER BY id LIMIT 1"))
    .rows[0];
  assert.ok(actor);
  await pool.query(
    "INSERT INTO staff_content_kinds (\"order\",parent_id,value) VALUES (999,$1,'immigration-policy')",
    [actor.id],
  );
  await assert.rejects(
    () => down({ db } as unknown as MigrateDownArgs),
    /Remove policy board grants/,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM staff_content_kinds WHERE value='immigration-policy'"))
      .rows[0].count,
    "1",
  );
  await pool.query("DELETE FROM staff_content_kinds WHERE value='immigration-policy'");
  await down({ db } as unknown as MigrateDownArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  await up({ db } as unknown as MigrateUpArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  console.log(
    `PASS policy workflow migration up/down/up preserves ${before.length} tables; rollback refuses active grants`,
  );
} finally {
  await pool.end();
  execFileSync(bin + "/dropdb", [database], { env, stdio: "pipe" });
}
