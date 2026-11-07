import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import {
  assertDemo,
  demoEnvironment,
  prepareApp,
  ensureFree,
  stopWeb,
  assertDemoPaths,
} from "../scripts/lib/demo-environment.mjs";

const fixture = () => ({
  marker: "hua-local-demo-v1",
  databaseURL: "postgresql://hua_demo:unit-password@127.0.0.1:55442/hua_companion_demo",
  secret: "unit-only-demo-secret-not-a-real-credential",
});
test("demo destructive guard rejects wrong server/database/options and missing marker", () => {
  assert.doesNotThrow(() => assertDemo(fixture()));
  for (const databaseURL of [
    fixture().databaseURL.replace("55442", "55438"),
    fixture().databaseURL.replace("hua_companion_demo", "hua_companion"),
    fixture().databaseURL.replace("127.0.0.1", "example.invalid"),
    fixture().databaseURL + "?host=example.invalid",
    fixture().databaseURL + "#fragment",
    fixture().databaseURL.replace("postgresql:", "http:"),
  ])
    assert.throws(() => assertDemo({ ...fixture(), databaseURL }));
  assert.throws(() => assertDemo({ ...fixture(), marker: "" }));
  assert.throws(() => assertDemo(null));
});
test("demo children receive safe local settings without inherited real keys", () => {
  const env = demoEnvironment(fixture(), "/tmp/demo-app", {
    PATH: "/safe/bin",
    NODE_ENV: "test",
    WORKFLOW_MAIL_ENABLED: "true",
    WORKFLOW_MAIL_API_KEY: "DoNotInherit",
    SUPPORT_AI_KEY: "DoNotInherit",
    DATABASE_URL: "DoNotInherit",
    NODE_OPTIONS: "--import=/untrusted/file",
  });
  assert.equal(env.DATABASE_URL, fixture().databaseURL);
  assert.equal(env.APP_URL, "http://127.0.0.1:3100");
  assert.equal(env.APP_ENV, "local");
  assert.equal(env.WORKFLOW_MAIL_ENABLED, "false");
  assert.equal(env.BUSINESS_AI_ENABLED, "false");
  assert.equal(env.VISA_CHECKER_ENABLED, "true");
  assert.equal("WORKFLOW_MAIL_API_KEY" in env, false);
  assert.equal("SUPPORT_AI_KEY" in env, false);
  assert.equal("NODE_OPTIONS" in env, false);
  assert.equal(env.PATH, "/safe/bin");
});
test("source snapshot isolates env, stale source, media and build output", () => {
  const root = mkdtempSync(join(tmpdir(), "hua-demo-unit-"));
  try {
    for (const dir of ["src", "scripts", "public", "node_modules", ".local/content-media"])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, ".env"), "REAL_SECRET=must-not-copy");
    writeFileSync(join(root, "src", "example.ts"), "export const current = 1;");
    const config = "export default buildConfig({ secret: unitSecret });";
    writeFileSync(join(root, "src", "payload.config.ts"), config);
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, ".local/content-media/original.webp"), "keep");
    const app = prepareApp(root);
    assert.equal(existsSync(join(app, ".env")), false);
    assert.ok(
      readFileSync(join(app, "src", "payload.config.ts"), "utf8").includes(
        'cookiePrefix: "hua-demo"',
      ),
    );
    assert.equal(readFileSync(join(root, "src", "payload.config.ts"), "utf8"), config);
    assert.equal(existsSync(join(app, ".local/content-media/original.webp")), false);
    mkdirSync(join(app, ".local/content-media"), { recursive: true });
    writeFileSync(join(app, ".local/content-media/demo.webp"), "demo");
    writeFileSync(join(app, "src", "stale.ts"), "stale");
    prepareApp(root);
    assert.equal(existsSync(join(app, "src", "stale.ts")), false);
    assert.equal(readFileSync(join(app, ".local/content-media/demo.webp"), "utf8"), "demo");
    assert.equal(readFileSync(join(root, ".local/content-media/original.webp"), "utf8"), "keep");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("occupied port is rejected without stopping its owner", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await assert.rejects(() => ensureFree(address.port), /占用/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("stop refuses a reused/unrelated PID even with a forged PID file", async () => {
  const root = mkdtempSync(join(tmpdir(), "hua-demo-pid-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  try {
    assert.ok(child.pid);
    writeFileSync(join(root, "web.json"), JSON.stringify({ pid: child.pid, token: "forged" }));
    await assert.rejects(() => stopWeb(root), /无关进程/);
    assert.doesNotThrow(() => process.kill(child.pid!, 0));
  } finally {
    child.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
test("existing demo env files are refused instead of loading outside credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "hua-demo-env-"));
  try {
    const app = prepareApp(root);
    writeFileSync(join(app, ".env.local"), "WORKFLOW_MAIL_ENABLED=true");
    assert.throws(() => prepareApp(root), /环境文件/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("demo refuses database symlinks before stopping an unrelated original cluster", () => {
  const root = mkdtempSync(join(tmpdir(), "hua-demo-link-"));
  try {
    mkdirSync(join(root, ".local/demo"), { recursive: true });
    mkdirSync(join(root, ".local/postgres"));
    symlinkSync(join(root, ".local/postgres"), join(root, ".local/demo/postgres"));
    assert.throws(() => assertDemoPaths(root), /符号链接/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
