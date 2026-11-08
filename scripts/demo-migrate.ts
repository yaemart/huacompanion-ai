import { readFileSync } from "node:fs";
import path from "node:path";
import { assertDemo } from "./lib/demo-environment.mjs";
const state = JSON.parse(
  readFileSync(path.join(process.env.HUA_DEMO_ROOT || "", "state.json"), "utf8"),
);
assertDemo(state);
if (
  process.env.APP_ENV !== "local" ||
  process.env.DATABASE_URL !== state.databaseURL ||
  process.env.HUA_DEMO_SCHEMA_PUSH !== "false"
)
  throw Error("仅允许隔离演示库执行既有迁移");
const { getPayload } = await import("payload");
const { default: config } = await import("../src/payload.config");
const p = await getPayload({ config });
try {
  await p.db.migrate();
} finally {
  await p.destroy();
}
process.exit(0);
