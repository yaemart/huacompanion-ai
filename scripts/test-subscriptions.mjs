import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { assertDemo, demoEnvironment } from "./lib/demo-environment.mjs";
import { subscriptionPreview } from "./lib/subscription-preview.mjs";

const ci = process.env.GITHUB_ACTIONS === "true";
function demoState() {
  let state;
  try {
    state = JSON.parse(readFileSync(".local/demo/state.json", "utf8"));
  } catch {
    throw Error("请先运行 npm run demo，启动本机演示数据库。");
  }
  assertDemo(state);
  return state;
}
const state = ci ? undefined : demoState();
const name = "hua_subscriptions_" + randomUUID().replaceAll("-", "");
const target = new URL(ci ? (process.env.DATABASE_URL ?? "") : state.databaseURL);
if (
  ci &&
  (target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.port !== "55438" ||
    target.username !== "hua" ||
    target.pathname !== "/hua_companion" ||
    target.search ||
    target.hash)
)
  throw Error("订阅 CI 只允许使用独立的测试数据库服务。");
target.pathname = "/postgres";
const maintainer = new pg.Client({ connectionString: target.toString() });
const preview = process.argv.includes("--preview");
if (ci && preview) throw Error("订阅预览仅在本机运行。");
const interrupt = new AbortController();
const stop = () => interrupt.abort();
if (preview) {
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
async function run() {
  let created = false;
  const { signal } = interrupt;
  try {
    await maintainer.connect().catch(() => {
      throw Error(
        ci
          ? "无法连接 CI 的 PostgreSQL 测试服务。"
          : "无法连接本机演示数据库。请先运行 npm run demo。",
      );
    });
    if (signal.aborted) return;
    await maintainer.query(`CREATE DATABASE "${name}"`);
    created = true;
    if (signal.aborted) return;
    target.pathname = "/" + name;
    const env = {
      ...(ci ? process.env : demoEnvironment(state, resolve(".local/demo/app"))),
      DATABASE_URL: target.toString(),
      PAYLOAD_SECRET: randomBytes(32).toString("hex"),
      APP_URL: "http://127.0.0.1:3000",
      DOTENV_CONFIG_PATH: "/dev/null",
      NODE_ENV: "production",
      APP_ENV: "local",
      HUA_DEMO_SCHEMA_PUSH: "false",
    };
    const args = ["node_modules/payload/bin.js", "migrate"];
    const migration = { env: { ...env, APP_ENV: "migration-test" }, stdio: "inherit" };
    if (preview) {
      const child = spawn(process.execPath, args, migration);
      const terminate = () => child.kill("SIGTERM");
      signal.addEventListener("abort", terminate, { once: true });
      try {
        const [code] = await once(child, "exit");
        if (signal.aborted) return;
        if (code !== 0) throw Error("订阅演示迁移未完成。");
      } finally {
        signal.removeEventListener("abort", terminate);
      }
      await subscriptionPreview(env, signal, process.argv.includes("--isolated-browser"));
    } else {
      execFileSync(process.execPath, args, migration);
      execFileSync(process.execPath, ["--import", "tsx", "tests/integration/subscriptions.ts"], {
        env,
        stdio: "inherit",
      });
    }
  } finally {
    try {
      if (created) {
        await maintainer.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        if (preview) console.log("临时订阅数据库已清理。");
      }
    } finally {
      await maintainer.end();
      if (preview) {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    }
  }
}
await run();
