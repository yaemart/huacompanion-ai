import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { up, down } from "../../src/migrations/20261102_050750_visa_search";
import { databaseFingerprints } from "../helpers/database-fingerprints";
const source = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  source.hostname !== "127.0.0.1" ||
  source.port !== "55438" ||
  source.pathname !== "/hua_companion"
)
  throw Error("Dedicated local DB only");
const backup =
  process.env.SEARCH_MIGRATION_BACKUP ||
  JSON.parse(readFileSync("backups/last-restore-check.json", "utf8")).backup;
const name = "hua_search_" + randomUUID().replaceAll("-", "");
const env = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port,
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
};
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@15/bin";
const run = (cmd: string, args: string[]) =>
  execFileSync(`${bin}/${cmd}`, args, { env, stdio: "pipe" });
run("createdb", [name]);
const target = new URL(source);
target.pathname = "/" + name;
const pool = new pg.Pool({ connectionString: target.toString(), max: 1 });
try {
  run("pg_restore", ["--no-owner", "--no-acl", "-d", name, backup]);
  const before = await databaseFingerprints(pool);
  const args = { db: { execute: (sql: string) => pool.query(sql) } } as never;
  await up(args);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  const row = (
    await pool.query(
      "INSERT INTO seo_settings(google_site_verification) VALUES('fixture-token') RETURNING id",
    )
  ).rows[0];
  await assert.rejects(() => down(args), /explicitly before rollback/);
  await pool.query("UPDATE seo_settings SET google_site_verification=NULL WHERE id=$1", [row.id]);
  await pool.query(
    `INSERT INTO seo_settings_pages(id,_order,_parent_id,path,locale) VALUES('search-migration',1,$1,'tools/china-visa-free-checker','en')`,
    [row.id],
  );
  await assert.rejects(() => down(args), /explicitly before rollback/);
  await pool.query("DELETE FROM seo_settings WHERE id=$1", [row.id]);
  await down(args);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  await up(args);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  console.log(
    `PASS search migration up/down/up preserves ${before.length} tables and refuses lossy rollback`,
  );
} finally {
  await pool.end();
  run("dropdb", [name]);
}
