import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseReminderCommand } from "../scripts/lib/exhibition-reminder-command.ts";
const api = await import("../src/lib/exhibition-reminder-scheduler-state.ts").catch(() => null);
const parser = () => {
  assert.ok(api?.parseSchedulerLedger, "strict scheduler ledger reader must exist");
  return api.parseSchedulerLedger;
};
const idle = { version: 1, runId: null, owner: null, targets: [], pending: null };
const scope = { key: "current-fair", locale: "zh" };
const active = {
  version: 1,
  runId: "47a193aa-3795-4b72-8135-96dd4ef83988",
  owner: 1,
  targets: [scope],
  pending: null,
};
test("empty ledger is unregistered idle, not an enabled scheduler", () => {
  assert.deepEqual(parser()({ revision: 0, state: idle }), { revision: 0, state: idle });
});
test("strict ledger accepts active and pending scopes without exposing alternate schema", () => {
  const parse = parser();
  const pending = { ...active, pending: { digest: "a".repeat(64), scope } };
  assert.deepEqual(parse({ revision: 4, state: active }), { revision: 4, state: active });
  assert.deepEqual(parse({ revision: 5, state: pending }), { revision: 5, state: pending });
});
for (const [name, value] of [
  ["future version", { ...idle, version: 2 }],
  ["extra field", { ...idle, force: true }],
  ["idle owner", { ...idle, owner: 1 }],
  ["idle targets", { ...idle, targets: [scope] }],
  ["bad run", { ...active, runId: "not-uuid" }],
  ["bad owner", { ...active, owner: "1" }],
  ["no targets", { ...active, targets: [] }],
  [
    "21 targets",
    {
      ...active,
      targets: Array.from({ length: 21 }, (_, i) => ({
        key: "fair-" + String(i).padStart(2, "0"),
        locale: "zh",
      })),
    },
  ],
  ["duplicates", { ...active, targets: [scope, scope] }],
  ["unsorted", { ...active, targets: [{ key: "z-fair", locale: "zh" }, scope] }],
  ["scope language", { ...active, targets: [{ ...scope, locale: "fr" }] }],
  ["scope fields", { ...active, targets: [{ ...scope, staffId: 1 }] }],
  ["scope path", { ...active, targets: [{ ...scope, key: "../secret" }] }],
  [
    "pending outside",
    { ...active, pending: { digest: "a".repeat(64), scope: { ...scope, key: "other-fair" } } },
  ],
  ["pending digest", { ...active, pending: { digest: "NOT-A-DIGEST", scope } }],
] as const)
  test(`rejects ${name} instead of silently making idle`, () => {
    const parse = parser();
    assert.throws(() => parse({ revision: 1, state: value }));
  });
test("revision zero cannot describe an active producer and invalid revisions fail", () => {
  const parse = parser();
  for (const revision of [-1, 0, 0.5, "1", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => parse({ revision, state: active }));
  assert.throws(() => parse({ revision: 1, state: null }));
  assert.throws(() => parse({ revision: 1, state: idle, force: true }));
});
test("readonly commands need only their own input files", () => {
  assert.deepEqual(parseReminderCommand(["inspect", "--auth-file", "a", "--receipt-file", "r"]), {
    mode: "inspect",
    authFile: "a",
    receiptFile: "r",
  });
  assert.deepEqual(parseReminderCommand(["scheduler-status", "--auth-file", "a"]), {
    mode: "scheduler-status",
    authFile: "a",
  });
  for (const extra of [
    ["--receipt-file", "r"],
    ["--force", "true"],
    ["--staffId", "1"],
    ["--now", "2027-01-01"],
  ])
    assert.throws(() => parseReminderCommand(["scheduler-status", "--auth-file", "a", ...extra]));
});
const dir = mkdtempSync(join(tmpdir(), "hua-recovery-unit-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const bad = join(dir, "bad.jwt");
writeFileSync(bad, "not-a-jwt", { mode: 0o600 });
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const shapedAuth = join(dir, "structured.jwt");
writeFileSync(
  shapedAuth,
  [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ id: 1, collection: "staff", sid: "fictional-unit", iat: 1, exp: 9999999999 }),
    Buffer.alloc(32).toString("base64url"),
  ].join("."),
  { mode: 0o600 },
);
const entry = fileURLToPath(new URL("../scripts/exhibition-reminders.ts", import.meta.url));
const run = (args: string[], env: Record<string, string | undefined> = {}) =>
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
for (const mode of ["inspect", "scheduler-status"])
  test(`real ${mode} rejects bad files before Payload initialization`, () => {
    const r = run([
      mode,
      "--auth-file",
      bad,
      ...(mode === "inspect" ? ["--receipt-file", bad] : []),
    ]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /0600常规文件/);
    assert.equal(r.stdout, "");
    assert.doesNotMatch(r.stderr, /PAYLOAD_SECRET|Error:|not-a-jwt/);
  });
test("real inspect rejects a malformed receipt after a structurally valid JWT before initialization", () => {
  const r = run(["inspect", "--auth-file", shapedAuth, "--receipt-file", bad]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /0600常规文件/);
  assert.doesNotMatch(r.stderr + r.stdout, /PAYLOAD_SECRET|DATABASE_URL|Error:|not-a-jwt/);
});
test("real inspect rejects a missing receipt argument before initialization", () => {
  const r = run(["inspect", "--auth-file", shapedAuth]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /参数无效/);
  assert.doesNotMatch(r.stderr + r.stdout, /PAYLOAD_SECRET|DATABASE_URL|Error:/);
});
test("real scheduler status rejects extraneous receipt arguments without echoing them", () => {
  const r = run([
    "scheduler-status",
    "--auth-file",
    shapedAuth,
    "--receipt-file",
    "private-argument-marker",
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /参数无效/);
  assert.doesNotMatch(
    r.stderr + r.stdout,
    /private-argument-marker|PAYLOAD_SECRET|DATABASE_URL|Error:/,
  );
});
test("new commands retain nonlocal and reset refusal and offer inert help", () => {
  for (const env of [{ APP_ENV: "production" }, { PAYLOAD_DROP_DATABASE: "true" }]) {
    const r = run(["scheduler-status", "--auth-file", bad], env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /仅限|重置/);
  }
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /inspect/);
  assert.match(help.stdout, /scheduler-status/);
});
test("controlled resolve requires a positive revision and bounded reason before initialization", () => {
  for (const revision of ["0", "-1", "1.5", "01", "9007199254740992"])
    assert.throws(() =>
      parseReminderCommand([
        "scheduler-resolve",
        "--auth-file",
        "private.jwt",
        "--revision",
        revision,
        "--reason",
        "verified",
      ]),
    );
  assert.deepEqual(
    parseReminderCommand([
      "scheduler-resolve",
      "--auth-file",
      "private.jwt",
      "--revision",
      "23",
      "--reason",
      " verified ",
    ]),
    { mode: "scheduler-resolve", authFile: "private.jwt", revision: 23, reason: "verified" },
  );
  for (const reason of [" ", "x".repeat(501)])
    assert.throws(() =>
      parseReminderCommand([
        "scheduler-resolve",
        "--auth-file",
        "private.jwt",
        "--revision",
        "23",
        "--reason",
        reason,
      ]),
    );
  const badRevision = run([
    "scheduler-resolve",
    "--auth-file",
    shapedAuth,
    "--revision",
    "0",
    "--reason",
    "private-reason-marker",
  ]);
  assert.equal(badRevision.status, 1);
  assert.match(badRevision.stderr, /参数无效/);
  assert.doesNotMatch(
    badRevision.stderr + badRevision.stdout,
    /private-reason-marker|PAYLOAD_SECRET|Error:/,
  );
  const badAuth = run([
    "scheduler-resolve",
    "--auth-file",
    bad,
    "--revision",
    "23",
    "--reason",
    "private-reason-marker",
  ]);
  assert.equal(badAuth.status, 1);
  assert.match(badAuth.stderr, /0600/);
  assert.doesNotMatch(
    badAuth.stderr + badAuth.stdout,
    /private-reason-marker|PAYLOAD_SECRET|Error:/,
  );
});
