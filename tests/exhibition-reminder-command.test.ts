import assert from "node:assert/strict";
import test, { after } from "node:test";
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
const api = await import("../scripts/lib/exhibition-reminder-command.ts").catch(() => null);
const command = () => {
  assert.ok(api, "private reminder command boundary must exist");
  return api;
};
const dir = mkdtempSync(join(tmpdir(), "hua-reminder-command-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const receipt = "eyJmaWxlIjoxfQ." + "a".repeat(64);
const file = (name: string, content = "header.payload.signature", mode = 0o600) => {
  const path = join(dir, name);
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
};
const preview = [
  "preview",
  "--key",
  "spring-fair",
  "--locale",
  "zh",
  "--auth-file",
  "private.jwt",
  "--receipt-file",
  "preview.receipt",
];
test("preview and apply accept only the documented scope and private file arguments", () => {
  assert.deepEqual(command().parseReminderCommand(preview), {
    mode: "preview",
    key: "spring-fair",
    locale: "zh",
    authFile: "private.jwt",
    receiptFile: "preview.receipt",
  });
  assert.deepEqual(
    command().parseReminderCommand(["apply", "--receipt-file", "r", "--auth-file", "a"]),
    { mode: "apply", receiptFile: "r", authFile: "a" },
  );
});
for (const args of [
  [],
  ["send"],
  [...preview, "--key", "another"],
  [...preview, "--force"],
  [...preview, "--date", "2027-02-08"],
  [...preview, "--auth-token", "private-value"],
  [...preview, "--staff-id", "1"],
  [...preview, "--send", "true"],
  ["apply", ...preview.slice(1)],
  preview.slice(0, -1),
  preview.map((s) => (s === "zh" ? "fr" : s)),
  preview.map((s) => (s === "spring-fair" ? "../bad" : s)),
])
  test(`rejects unsupported command shape ${JSON.stringify(args.slice(0, 3))}`, () => {
    assert.throws(() => command().parseReminderCommand(args));
  });
test("reads raw existing JWT and opaque receipt from owned private regular files", () => {
  assert.equal(
    command().readReminderFile(file("valid.jwt", "header.payload.signature\n"), "auth"),
    "header.payload.signature",
  );
  assert.equal(
    command().readReminderFile(file("valid.receipt", receipt + "\r\n"), "receipt"),
    receipt,
  );
});
for (const mode of [0o644, 0o640, 0o660, 0o400, 0o1600])
  test(`rejects input permissions ${mode.toString(8)}`, () => {
    assert.throws(() => command().readReminderFile(file("mode-" + mode, undefined, mode), "auth"));
  });
test("rejects symlinks, hard links, directories, missing and empty credentials", () => {
  const target = file("link-target");
  symlinkSync(target, join(dir, "symlink"));
  linkSync(target, join(dir, "hardlink"));
  for (const path of [
    join(dir, "symlink"),
    join(dir, "hardlink"),
    dir,
    join(dir, "missing"),
    file("empty", ""),
  ])
    assert.throws(() => command().readReminderFile(path, "auth"));
});
test("rejects wrong credential formats and overlong file content without returning private values", () => {
  for (const [name, content, kind] of [
    ["password", "private-password", "auth"],
    ["header", "JWT header.payload.signature", "auth"],
    ["json", '{"token":"private-token"}', "auth"],
    ["large", "a".repeat(8189) + ".b.c", "auth"],
    ["bad-receipt", "private-token", "receipt"],
    ["large-receipt", "a".repeat(1984) + "." + "a".repeat(64), "receipt"],
  ] as const) {
    assert.throws(
      () => command().readReminderFile(file(name, content), kind),
      (e) => {
        assert.doesNotMatch(String(e), /private-password|private-token|header\.payload/);
        return true;
      },
    );
  }
});
test("new receipt is 0600, durable and cannot overwrite an existing file or link", () => {
  const path = join(dir, "new.receipt");
  command().assertNewReminderReceipt(path);
  command().saveReminderReceipt(path, receipt);
  assert.equal(readFileSync(path, "utf8"), receipt + "\n");
  assert.equal(statSync(path).mode & 0o7777, 0o600);
  assert.throws(() => command().assertNewReminderReceipt(path));
  assert.throws(() => command().saveReminderReceipt(path, "b." + "b".repeat(64)));
  assert.equal(readFileSync(path, "utf8"), receipt + "\n");
  const target = file("output-link-target", "preserved");
  symlinkSync(target, join(dir, "output-link"));
  assert.throws(() => command().saveReminderReceipt(join(dir, "output-link"), receipt));
  assert.equal(readFileSync(target, "utf8"), "preserved");
  symlinkSync(join(dir, "absent-target"), join(dir, "dangling-output"));
  assert.throws(() => command().assertNewReminderReceipt(join(dir, "dangling-output")));
});
const report = {
  scope: { key: "spring-fair", locale: "zh" as const },
  snapshot: { title: "已审核展会", revision: 3 },
  today: "2027-02-08",
  asOf: "2027-02-08T04:00:00.000Z",
  offset: 30 as const,
  counts: {
    subscribers: 5,
    eligible: 3,
    terminal: 1,
    create: 2,
    existing: 1,
    cancel: 2,
    excluded: { unconfirmed: 4 },
  },
  blocked: false,
  replayed: false,
  currentEligibility: "checked",
  receipt,
};
test("Chinese report distinguishes subscribers, current window and explicit local changes", () => {
  const text = command().formatReminderReport(report, "preview");
  for (const phrase of [
    /未发送/,
    /已审核展会/,
    /订阅合资格：5/,
    /本档待发：3/,
    /取消终态：1/,
    /拟新增：2/,
    /已存在：1/,
    /拟取消：2/,
    /排除：4/,
  ])
    assert.match(text, phrase);
  const applied = command().formatReminderReport(report, "apply");
  assert.match(applied, /本次新增：2/);
  assert.match(applied, /本次取消：2/);
});
test("history report cannot present old counts as current eligibility", () => {
  const text = command().formatReminderReport(
    { ...report, replayed: true, currentEligibility: "not-checked" },
    "apply",
  );
  assert.match(text, /历史/);
  assert.match(text, /当前资格未检查/);
  assert.match(text, /当时新增：2/);
  assert.doesNotMatch(text, /本档待发|本次新增/);
});
test("report whitelists fields and removes terminal control characters from public title", () => {
  const text = command().formatReminderReport(
    {
      ...report,
      snapshot: { ...report.snapshot, title: "name\u001b[31m\n伪造\u202e\r标题" },
      email: "private@example.invalid",
      subscription: 83719,
      recipientHash: "private-hash",
    } as typeof report,
    "preview",
  );
  assert.doesNotMatch(text, /private@example|83719|private-hash|eyJmaWxl|\u202e|\r/);
  assert.equal(text.includes(String.fromCodePoint(27)), false);
  assert.doesNotMatch(text, /\n伪造/);
  assert.match(command().formatReminderReport({ ...report, blocked: true }, "preview"), /阻止/);
});

const entry = fileURLToPath(new URL("../scripts/exhibition-reminders.ts", import.meta.url));
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", entry, ...args], {
    env: {
      ...process.env,
      APP_ENV: "local",
      DOTENV_CONFIG_PATH: "/dev/null",
      PAYLOAD_SECRET: "",
      DATABASE_URL: "",
      ...env,
    },
    encoding: "utf8",
    timeout: 10000,
  });
const argumentsFor = (auth: string, receiptFile: string) => [
  "preview",
  "--key",
  "spring-fair",
  "--locale",
  "zh",
  "--auth-file",
  auth,
  "--receipt-file",
  receiptFile,
];
for (const mode of ["trial", "production", "ci", ""])
  test(`real command rejects ${mode || "missing"} mode before Payload configuration`, () => {
    const result = run(preview, { APP_ENV: mode });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /仅限.*APP_ENV=local/);
    assert.equal(result.stdout, "");
  });
test("real command rejects supplied secrets/unsupported switches before initialization without echoing them", () => {
  const result = run([...preview, "--auth-token", "private-command-secret"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /参数无效/);
  assert.doesNotMatch(
    result.stderr + result.stdout,
    /private-command-secret|PAYLOAD_SECRET|Error:/,
  );
});
test("real command rejects invalid private files before initialization", () => {
  const result = run(
    argumentsFor(file("cli-public", undefined, 0o644), join(dir, "unused-receipt")),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /0600常规文件/);
  assert.equal(result.stdout, "");
});
test("real command rejects an existing receipt before configuration and preserves its bytes", () => {
  const target = file("already.receipt", "keep-original");
  const result = run(argumentsFor(file("cli-private"), target));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /回执目标已存在/);
  assert.equal(readFileSync(target, "utf8"), "keep-original");
});
test("real command rejects FIFO credentials promptly instead of hanging on open", () => {
  const fifo = join(dir, "auth.fifo");
  execFileSync("mkfifo", [fifo]);
  chmodSync(fifo, 0o600);
  const result = run(argumentsFor(fifo, join(dir, "fifo.receipt")));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /特殊文件/);
  assert.equal(result.error, undefined);
});
test("help is inert, available without configuration and never starts Payload", () => {
  const result = run(["--help"], { APP_ENV: "production" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /preview/);
  assert.match(result.stdout, /apply/);
  assert.equal(result.stderr, "");
});
test("unexpected initialization failure prints no stack, URI or secret", () => {
  const result = run(argumentsFor(file("unavailable-private"), join(dir, "db-failure.receipt")), {
    PAYLOAD_SECRET: "private-payload-secret-over32-characters",
    DATABASE_URL: "postgresql://private_user:private_db_password@127.0.0.1:1/private_db_marker",
    HUA_DEMO_SCHEMA_PUSH: "true",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /操作未完成/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /private_user|private_db_password|private_db_marker|private-payload|Error:|at .*\(/,
  );
});
