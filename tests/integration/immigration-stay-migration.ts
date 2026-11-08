import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261108_120000_policy_stay_hours";
const url = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  !["55438", "55442"].includes(url.port) ||
  !["/hua_companion", "/hua_companion_demo"].includes(url.pathname)
)
  throw Error("Isolated local test only");
const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Temporary tables shadow the real tables; no public data/schema is altered.
  await client.query(`CREATE TEMP TABLE imm_policies (id integer, max_stay_days numeric, snapshot jsonb);
    CREATE TEMP TABLE content_published (body jsonb);
    CREATE TEMP TABLE _imm_policies_v (id integer, version_max_stay_days numeric);
    INSERT INTO imm_policies VALUES (1,3,'{"policyType":"transit-240h","maxStayDays":3}');
    INSERT INTO _imm_policies_v VALUES (1,3);`);
  const db = { execute: (sql: string) => client.query(sql) };
  const args = { db } as unknown as MigrateUpArgs;
  const before = (await client.query("SELECT * FROM imm_policies")).rows;
  await up(args);
  assert.deepEqual(
    (await client.query("SELECT id,max_stay_days,snapshot FROM imm_policies")).rows,
    before,
  );
  assert.equal(
    (await client.query("SELECT max_stay_hours FROM imm_policies")).rows[0].max_stay_hours,
    null,
  );
  assert.equal(
    (await client.query("SELECT version_max_stay_hours FROM _imm_policies_v")).rows[0]
      .version_max_stay_hours,
    null,
  );
  await down(args as unknown as MigrateDownArgs);
  await up(args);
  for (const table of ["imm_policies", "_imm_policies_v"]) {
    const col = table === "imm_policies" ? "max_stay_hours" : "version_max_stay_hours";
    await client.query(`UPDATE ${table} SET ${col}=144`);
    await client.query("SAVEPOINT rollback_guard");
    await assert.rejects(() => down(args as unknown as MigrateDownArgs), /hours|小时/i);
    await client.query("ROLLBACK TO SAVEPOINT rollback_guard");
    await client.query(`UPDATE ${table} SET ${col}=NULL`);
  }
  await client.query(`INSERT INTO content_published VALUES ('{"policy":{"maxStayHours":144}}')`);
  await client.query("SAVEPOINT snapshot_guard");
  await assert.rejects(() => down(args as unknown as MigrateDownArgs), /hours|小时/i);
  await client.query("ROLLBACK TO SAVEPOINT snapshot_guard");
  assert.deepEqual(
    (await client.query("SELECT id,max_stay_days,snapshot FROM imm_policies")).rows,
    before,
  );
  console.log(
    "PASS additive up/down/up preserves legacy days/JSON and refuses rollback with hours in master or history",
  );
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
