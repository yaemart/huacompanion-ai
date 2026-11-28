import { readFileSync, realpathSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import { assertCrmTarget } from "./lib/crm-test-target.mjs";

if (process.version !== "v24.22.1") throw Error("Node24.22.1 required");
const mode = process.argv[2] ?? "test";
if (
  ![
    "test",
    "types",
    "build",
    "links",
    "session",
    "http",
    "preview",
    "overview",
    "assignments",
    "modules",
  ].includes(mode)
)
  throw Error("Unknown CRM test mode");
const ci = process.env.GITHUB_ACTIONS === "true";
const name = "hua_crm_test_" + randomUUID().replaceAll("-", "");
const target = new URL("postgresql://crm_owner@127.0.0.1:55443/" + name);
target.password = ci ? "crm-ci-only" : readFileSync(".local/crm/pg-password", "utf8").trim();
assertCrmTarget(target.toString());
const maintenance = new URL(target);
maintenance.pathname = "/postgres";
const admin = new pg.Client({ connectionString: maintenance.toString() });
let created = false;
try {
  await admin.connect();
  const identity = await admin.query(
    "SELECT current_user, current_setting('data_directory') AS directory, current_setting('server_version_num') AS version",
  );
  const row = identity.rows[0];
  if (
    row.current_user !== "crm_owner" ||
    Number(row.version) < 150000 ||
    Number(row.version) >= 160000 ||
    (ci
      ? row.directory !== "/var/lib/postgresql/data"
      : realpathSync(row.directory) !== realpathSync(".local/crm/pgdata"))
  )
    throw Error("Wrong CRM cluster identity");
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DATABASE_URL: target.toString(),
    PAYLOAD_SECRET: randomBytes(48).toString("hex"),
    APP_ENV: "local",
    NODE_ENV: "production",
    APP_URL: "http://127.0.0.1:3201",
    HUA_DEMO_SCHEMA_PUSH: "false",
    DOTENV_CONFIG_PATH: "/dev/null",
    NEXT_TELEMETRY_DISABLED: "1",
    PAYLOAD_DISABLE_TELEMETRY: "true",
    WORKFLOW_MAIL_ENABLED: "false",
    BUSINESS_AI_ENABLED: "false",
    INTAKE_ENABLED: "false",
    HUA_CRM_ISOLATED: "true",
    CRM_CLUSTER_ROOT: row.directory,
  };
  const run = (args, overrides = {}) =>
    execFileSync(process.execPath, args, {
      env: { ...env, ...overrides },
      cwd: resolve("."),
      stdio: "inherit",
      timeout: mode === "preview" ? 3600000 : 600000,
    });
  if (mode === "types") run(["node_modules/payload/bin.js", "generate:types"]);
  else {
    run(["node_modules/payload/bin.js", "migrate"], { APP_ENV: "migration-test" });
    if (mode === "build") run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
    else if (mode === "http" || mode === "preview")
      run([
        "--import",
        "tsx",
        "tests/integration/crm-http.ts",
        ...(mode === "preview" ? ["--preview"] : []),
      ]);
    else if (mode === "session") run(["--import", "tsx", "tests/integration/crm-session.ts"]);
    else if (mode === "assignments")
      run(["--import", "tsx", "tests/integration/crm-assignments.ts"]);
    else if (mode === "overview") run(["--import", "tsx", "tests/integration/crm-overview.ts"]);
    else if (mode === "links") run(["--import", "tsx", "tests/integration/crm-links.ts"]);
    else if (mode === "modules") {
      run(["--import", "tsx", "tests/helpers/isolated-module-bootstrap.ts"]);
      for (const suite of [
        "permissions-content",
        "catalog",
        "institutions",
        "lifestyle",
        "housekeeping",
        "content-agent",
        "support-agent",
        "support-voice",
        "calls",
        "support-operations",
        "support-operations-db",
        "workflow-customer",
      ])
        run(["--import", "tsx", `tests/integration/${suite}.ts`]);
    } else {
      run(["--import", "tsx", "tests/integration/crm.ts"]);
      run(["--import", "tsx", "tests/integration/crm-links.ts"]);
      run(["--import", "tsx", "tests/integration/crm-session.ts"]);
      run(["--import", "tsx", "tests/integration/crm-overview.ts"]);
      run(["--import", "tsx", "tests/integration/crm-assignments.ts"]);
      for (const suite of ["business", "customer", "permissions-business"])
        run(["--import", "tsx", `tests/integration/${suite}.ts`]);
      run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
      run(["--import", "tsx", "tests/integration/crm-http.ts"]);
    }
  }
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
console.log(`CRM ${mode} completed; only run-owned database removed.`);
