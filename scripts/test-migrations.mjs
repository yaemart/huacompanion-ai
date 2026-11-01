import "dotenv/config";
import { execFileSync } from "node:child_process";
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
  execFileSync(process.execPath, ["node_modules/payload/bin.js", "migrate"], {
    env: {
      ...env,
      DATABASE_URL: target.toString(),
      APP_ENV: "migration-test",
      NODE_ENV: "production",
    },
    stdio: "pipe",
    timeout: 60000,
  });
  const pool = new pg.Pool({ connectionString: target.toString() });
  try {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
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
      "support_conversations",
      "support_messages",
      "support_settings",
      "support_voice_audio",
      "support_voice_jobs",
      "support_calls",
      "support_call_presence",
      "support_feedback",
      "support_reviews",
      "support_retention_audits",
      "service_cases",
      "business_ai_tasks",
      "service_quotes",
      "service_events",
      "workflow_tasks",
      "workflow_mail_jobs",
      "workflow_customer_notifications",
      "customer_accounts",
      "customer_sessions",
      "customer_inquiry_links",
      "content_quality",
      "content_quality_events",
      "seo_settings",
      "seo_settings_pages",
    ])
      if (!tables.rows.some((r) => r.tablename === name))
        throw Error("Missing migrated table: " + name);
    const clientKey = await pool.query(
      "SELECT column_name FROM information_schema.columns " +
        "WHERE table_schema='public' AND table_name='intake_limits' AND column_name='client_key'",
    );
    if (clientKey.rowCount !== 1) throw Error("Missing intake client key");
    const indexes = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='intake_limits'",
    );
    if (!indexes.rows.some((row) => /UNIQUE.*\(bucket, client_key\)/.test(row.indexdef)))
      throw Error("Missing unique per-client intake quota index");
  } finally {
    await pool.end();
  }
  console.log(
    "Initial migration successfully created all backend tables in an empty isolated database.",
  );
} catch (error) {
  if (error.stderr) console.error(String(error.stderr).slice(-2500));
  throw new Error("Migration verification failed; primary database was not changed.");
} finally {
  execFileSync(bin + "/dropdb", [database], { env, stdio: "pipe" });
}
