import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { assertDemo, demoEnvironment } from "./lib/demo-environment.mjs";

let state;
try {
  state = JSON.parse(readFileSync(".local/demo/state.json", "utf8"));
} catch {
  throw Error("请先运行 npm run demo，启动本机演示数据库。");
}
assertDemo(state);
const name = "hua_subscriptions_" + randomUUID().replaceAll("-", "");
const target = new URL(state.databaseURL);
target.pathname = "/postgres";
const maintainer = new pg.Client({ connectionString: target.toString() });
await maintainer.connect().catch(() => {
  throw Error("无法连接本机演示数据库。请先运行 npm run demo。");
});
let created = false;
try {
  await maintainer.query(`CREATE DATABASE "${name}"`);
  created = true;
  target.pathname = "/" + name;
  const env = {
    ...demoEnvironment(state, resolve(".local/demo/app")),
    DATABASE_URL: target.toString(),
    PAYLOAD_SECRET: randomBytes(32).toString("hex"),
    APP_URL: "http://127.0.0.1:3000",
    DOTENV_CONFIG_PATH: "/dev/null",
    NODE_ENV: "production",
  };
  execFileSync(process.execPath, ["node_modules/payload/bin.js", "migrate"], {
    env: { ...env, APP_ENV: "migration-test" },
    stdio: "inherit",
  });
  execFileSync(process.execPath, ["--import", "tsx", "tests/integration/subscriptions.ts"], {
    env,
    stdio: "inherit",
  });
} finally {
  try {
    if (created) await maintainer.query(`DROP DATABASE "${name}"`);
  } finally {
    await maintainer.end();
  }
}
