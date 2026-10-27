import "dotenv/config";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "55438" ||
  url.pathname !== "/hua_companion"
)
  throw Error("Dedicated local database required");
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@15/bin";
const database = `hua_migration_${Date.now()}`;
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port,
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
execFileSync(bin + "/createdb", [database], { env, stdio: "pipe" });
try {
  const target = new URL(url);
  target.pathname = "/" + database;
  execFileSync(
    resolve("node_modules/node/bin/node"),
    ["node_modules/payload/bin.js", "migrate"],
    {
      env: {
        ...env,
        DATABASE_URL: target.toString(),
        APP_ENV: "migration-test",
        NODE_ENV: "production",
      },
      stdio: "pipe",
      timeout: 60000,
    },
  );
  const pool = new pg.Pool({ connectionString: target.toString() });
  try {
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    for (const name of [
      "staff",
      "inquiries",
      "providers",
      "notifications",
      "audit_events",
      "intake_limits",
      "content_drafts",
      "content_published",
      "content_events",
      "content_media",
      "content_agent_tasks",
    ])
      if (!tables.rows.some((r) => r.tablename === name))
        throw Error("Missing migrated table: " + name);
  } finally {
    await pool.end();
  }
  console.log(
    "Initial migration successfully created all backend tables in an empty isolated database.",
  );
} catch (error) {
  if (error.stderr) console.error(String(error.stderr).slice(-2500));
  throw new Error(
    "Migration verification failed; primary database was not changed.",
  );
} finally {
  execFileSync(bin + "/dropdb", [database], { env, stdio: "pipe" });
}
