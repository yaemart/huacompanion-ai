import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261101_025904_intake_client_limits";
import { consumeIntakeQuota } from "../../src/server/rate-limit";

if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw new Error("Local test database required");
const schema = `intake_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const isolated = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options: `-c search_path=${schema}`,
});
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await isolated.query(`CREATE TABLE intake_limits (
    bucket numeric NOT NULL, count numeric NOT NULL DEFAULT 0, updated_at timestamptz DEFAULT now()
  )`);
  await isolated.query("CREATE UNIQUE INDEX intake_limits_bucket_idx ON intake_limits (bucket)");
  const oldBucket = Math.floor(Date.now() / 600000) - 1;
  await isolated.query("INSERT INTO intake_limits (bucket, count) VALUES ($1,42)", [oldBucket]);
  // A minimal execution adapter runs the actual migration SQL in the isolated PostgreSQL schema.
  const db = { execute: (sql: string) => isolated.query(sql) };
  await up({ db } as unknown as MigrateUpArgs);
  let preserved = await isolated.query(
    "SELECT client_key, count FROM intake_limits WHERE bucket=$1",
    [oldBucket],
  );
  assert.deepEqual(preserved.rows, [{ client_key: "global", count: "42" }]);
  console.log("PASS migration adds client identity while preserving existing global count");
  const policy = { bucket: Math.floor(Date.now() / 600000), clientLimit: 2, globalLimit: 4 };
  const take = (key: string) => consumeIntakeQuota(isolated, key, policy);
  assert.equal(await take("a"), true);
  assert.equal(await take("a"), true);
  assert.deepEqual(
    await Promise.all(Array.from({ length: 15 }, () => take("a"))),
    Array(15).fill(false),
  );
  assert.equal(await take("b"), true);
  assert.equal(await take("b"), true);
  assert.equal(await take("c"), false);
  let rows = await isolated.query("SELECT client_key, count FROM intake_limits WHERE bucket=$1", [
    policy.bucket,
  ]);
  assert.equal(Number(rows.rows.find((row) => row.client_key === "global").count), 4);
  assert.equal(Number(rows.rows.find((row) => row.client_key === "a").count), 2);
  console.log("PASS exhausted client cannot consume global quota or block another client");
  const concurrent = { ...policy, bucket: policy.bucket + 1, clientLimit: 5, globalLimit: 9 };
  const outcomes = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      consumeIntakeQuota(isolated, `client-${i % 5}`, concurrent),
    ),
  );
  assert.equal(outcomes.filter(Boolean).length, 9);
  rows = await isolated.query("SELECT client_key, count FROM intake_limits WHERE bucket=$1", [
    concurrent.bucket,
  ]);
  assert.equal(Number(rows.rows.find((row) => row.client_key === "global").count), 9);
  assert.ok(rows.rows.every((row) => row.client_key === "global" || Number(row.count) <= 5));
  console.log("PASS PostgreSQL atomic concurrent client and global caps");
  await down({ db } as unknown as MigrateDownArgs);
  preserved = await isolated.query("SELECT count FROM intake_limits WHERE bucket=$1", [oldBucket]);
  assert.deepEqual(preserved.rows, [{ count: "42" }]);
  const global = await isolated.query("SELECT count FROM intake_limits WHERE bucket=$1", [
    concurrent.bucket,
  ]);
  assert.deepEqual(global.rows, [{ count: "9" }]);
  console.log(
    "PASS rollback retains global counts and restores old unique buckets after client traffic",
  );
} finally {
  await isolated.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
