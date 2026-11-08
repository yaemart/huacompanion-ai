import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  lstatSync,
  renameSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { webAddress } from "./demo-runtime.mjs";

export function assertDemo(state) {
  try {
    const url = new URL(state.databaseURL);
    if (
      state.marker !== "hua-local-demo-v1" ||
      state.secret.length < 32 ||
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "55442" ||
      url.pathname !== "/hua_companion_demo" ||
      url.username !== "hua_demo" ||
      !url.password ||
      url.search ||
      url.hash
    )
      throw Error();
  } catch {
    throw Error("拒绝操作：不是本工具的独立演示数据库。");
  }
}
export function demoEnvironment(state, app, inherited = process.env, host = "127.0.0.1") {
  assertDemo(state);
  return {
    PATH: inherited.PATH,
    HOME: inherited.HOME,
    TMPDIR: inherited.TMPDIR,
    LANG: "en_US.UTF-8",
    NODE_ENV: "development",
    APP_ENV: "local",
    DATABASE_URL: state.databaseURL,
    PAYLOAD_SECRET: state.secret,
    APP_URL: webAddress(host).url,
    NEXT_PUBLIC_FORM_MODE: "local",
    SITE_LOCALES: "en,zh",
    SEARCH_ENGINE_INDEXING: "false",
    VISA_CHECKER_ENABLED: "true",
    INTAKE_ENABLED: "true",
    BUSINESS_AI_ENABLED: "false",
    WORKFLOW_MAIL_ENABLED: "false",
    SUPPORT_CALL_AI_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    DISABLE_PAYLOAD_HMR: "true",
    HUA_DEMO_ROOT: resolve(app, ".."),
    DOTENV_CONFIG_PATH: resolve(app, ".env.demo-unused"),
  };
}
export function assertDemoPaths(root) {
  for (const name of [
    ".local",
    ".local/demo",
    ".local/demo/app",
    ".local/demo/postgres",
    ".local/demo/app/.local",
    ".local/demo/app/.local/content-media",
    ".local/backups",
    ".local/test-accounts.txt",
    ".local/demo/accounts.txt",
  ]) {
    const dir = resolve(root, name);
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw Error("演示目录不能是符号链接");
  }
}
export function prepareCluster(root, state) {
  assertDemo(state);
  assertDemoPaths(root);
  const data = resolve(root, ".local/demo/postgres");
  if (state.clusterInitialized || state.seeded) {
    if (!existsSync(resolve(data, "PG_VERSION")))
      throw Error("已完成的演示数据库缺少版本文件，请保留现场并检查备份。");
    return { initialize: false };
  }
  if (existsSync(resolve(data, "postmaster.pid")))
    throw Error("未完成的演示库存在启动记录，请先确认数据库已停止；未移动目录。");
  if (existsSync(data) && readdirSync(data).length) {
    const quarantine = resolve(root, `.local/demo/interrupted-postgres-${randomUUID()}`);
    renameSync(data, quarantine);
    return { initialize: true, quarantine };
  }
  return { initialize: true };
}
export function describeDemoFailure(error, secrets = []) {
  if (error.code === "DEMO_CANCELLED")
    return { message: "已取消，演示数据未清除。", diagnostics: "", exitCode: 0 };
  const redact = (value) => {
    let result = String(value || "").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[数据库凭据已隐藏]");
    for (const secret of secrets.filter(Boolean)) result = result.split(secret).join("[已隐藏]");
    return result.slice(0, 12000);
  };
  const command = String(error.path || error.spawnargs?.[0] || "");
  const tool =
    [
      "postgres",
      "initdb",
      "pg_ctl",
      "psql",
      "createdb",
      "dropdb",
      "pg_dump",
      "brew",
      "node",
      "npm",
    ].find((name) => basename(command) === name) || "启动器";
  const code = /^[A-Z_0-9]+$/.test(error.code || "")
    ? error.code
    : Number.isInteger(error.status)
      ? `EXIT_${error.status}`
      : "FAILED";
  const hint =
    tool === "启动器" && !error.code && error.status === undefined
      ? ` ${redact(error.message)}`
      : " 请检查Node与PostgreSQL15环境及PG_BIN配置。";
  return {
    message: `演示操作失败（${tool}/${code}）。${hint} 详情见.local/demo/control.log。`,
    diagnostics: redact(`${error.message || ""}\n${error.stderr || ""}`),
    exitCode: 1,
  };
}
export function prepareApp(root) {
  assertDemoPaths(root);
  const app = resolve(root, ".local/demo/app");
  if (existsSync(app) && readdirSync(app).some((name) => name.startsWith(".env")))
    throw Error("演示源码目录中存在环境文件，请先移出这些文件再启动。");
  for (const dir of [resolve(root, ".local"), resolve(root, ".local/demo"), app]) {
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw Error("演示目录不能是符号链接");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  for (const name of ["src", "public", "scripts"]) {
    const target = resolve(app, name);
    rmSync(target, { recursive: true, force: true });
    if (existsSync(resolve(root, name)))
      cpSync(resolve(root, name), target, {
        recursive: true,
        filter: (file) => !basename(file).startsWith(".env"),
      });
  }
  const configFile = resolve(app, "src/payload.config.ts");
  if (existsSync(configFile)) {
    const source = readFileSync(configFile, "utf8");
    if (!source.includes("export default buildConfig({"))
      throw Error("演示配置格式变化，需更新启动器。");
    writeFileSync(
      configFile,
      source
        .replace(
          "export default buildConfig({",
          'export default buildConfig({\n  cookiePrefix: "hua-demo",',
        )
        .replace(
          'push: process.env.APP_ENV === "local",',
          'push: process.env.APP_ENV === "local" && process.env.HUA_DEMO_SCHEMA_PUSH !== "false",',
        ),
    );
  }
  for (const name of [
    "package.json",
    "package-lock.json",
    "next.config.mjs",
    "tsconfig.json",
    "next-env.d.ts",
    "payload-types.ts",
    ".nvmrc",
  ]) {
    if (existsSync(resolve(root, name))) cpSync(resolve(root, name), resolve(app, name));
  }
  if (existsSync(resolve(root, "node_modules")) && !existsSync(resolve(app, "node_modules")))
    symlinkSync(resolve(root, "node_modules"), resolve(app, "node_modules"), "dir");
  return app;
}
export async function ensureFree(port, host = "127.0.0.1") {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once("error", () => fail(Error(`端口${port}已占用；未停止其他程序。`)));
    server.listen(port, host, ok);
  });
  await new Promise((ok) => server.close(ok));
}
export function webOwner(dir) {
  const file = resolve(dir, "web.json");
  if (!existsSync(file)) return null;
  const state = JSON.parse(readFileSync(file, "utf8"));
  if (!Number.isSafeInteger(state.pid) || state.pid < 2 || !/^[a-f0-9]{32}$/.test(state.token))
    throw Error("拒绝关闭无关进程：演示PID无效。");
  try {
    process.kill(state.pid, 0);
  } catch (error) {
    if (error.code !== "ESRCH")
      throw Error("无法确认演示进程身份，未关闭任何进程。", { cause: error });
    unlinkSync(file);
    return null;
  }
  let command;
  try {
    command = execFileSync("ps", ["-p", String(state.pid), "-o", "command="], { encoding: "utf8" });
  } catch (error) {
    throw Error("无法确认演示进程身份，请稍后重试。", { cause: error });
  }
  if (
    !Number.isSafeInteger(state.pid) ||
    state.pid < 2 ||
    !/^[a-f0-9]{32}$/.test(state.token) ||
    !command.includes(`demo.mjs serve ${state.token}`)
  )
    throw Error("拒绝关闭无关进程：演示PID已不匹配。");
  return state;
}
export async function stopWeb(dir) {
  const state = webOwner(dir);
  if (!state) return;
  process.kill(state.pid, "SIGTERM");
  for (let i = 0; i < 60; i++) {
    await delay(200);
    if (!webOwner(dir)) return;
  }
  throw Error("演示网站仍在退出，请稍后再试；未强制关闭其他进程。");
}
