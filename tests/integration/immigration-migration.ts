import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261101_082855_immigration_policies";
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
  process.env.POLICY_MIGRATION_BACKUP || ".local/visa-collection-before/database.dump",
);
if (!existsSync(backup))
  throw Error("Pre-policy-migration backup required; see docs/immigration-policies.md");
const database = `hua_policy_migration_${randomUUID().replaceAll("-", "")}`;
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
  assert.equal(
    (await pool.query<{ name: string | null }>("SELECT to_regclass('public.imm_policies') AS name"))
      .rows[0].name,
    null,
    "Backup must precede the policy migration",
  );
  const before = await databaseFingerprints(pool);
  const db = { execute: (statement: string) => pool.query(statement) };
  await up({ db } as unknown as MigrateUpArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  const created = await pool.query<{ id: number; status: string; revision: string }>(
    "INSERT INTO imm_policies(policy_key) VALUES ('fictional-migration-fixture') " +
      "RETURNING id,status,revision",
  );
  assert.equal(created.rows[0].status, "draft");
  assert.equal(created.rows[0].revision, "1");
  await assert.rejects(() =>
    pool.query("INSERT INTO imm_policies(policy_key) VALUES ('fictional-migration-fixture')"),
  );
  await pool.query(
    "INSERT INTO _imm_policies_v(parent_id,version_policy_key) VALUES ($1,'fixture-version')",
    [created.rows[0].id],
  );
  console.log(
    `PASS upgrade preserves ${before.length} existing tables and policy defaults/unique key`,
  );
  await down({ db } as unknown as MigrateDownArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  assert.equal(
    (await pool.query<{ name: string | null }>("SELECT to_regclass('public.imm_policies') AS name"))
      .rows[0].name,
    null,
  );
  console.log(
    "PASS rollback removes only new policy schema and preserves all existing row contents",
  );
  await up({ db } as unknown as MigrateUpArgs);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  console.log("PASS upgrade after rollback; original local database never used as restore target");
} finally {
  await pool.end();
  execFileSync(bin + "/dropdb", [database], { env, stdio: "pipe" });
}
