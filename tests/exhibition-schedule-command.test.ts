import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseReminderCommand } from "../scripts/lib/exhibition-reminder-command.ts";
const local = join(fs.realpathSync(process.cwd()), ".local");
fs.mkdirSync(local, { recursive: true, mode: 0o700 });
const dir = fs.mkdtempSync(join(local, "schedule-command-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const auth = join(dir, "admin.jwt"),
  manifest = join(dir, "manifest.json"),
  state = join(dir, "new"),
  bad = join(dir, "bad");
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
fs.writeFileSync(
  auth,
  [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ id: 1, collection: "staff", sid: "fictional", iat: 1, exp: 9999999999 }),
    Buffer.alloc(32).toString("base64url"),
  ].join("."),
  { mode: 0o600 },
);
fs.writeFileSync(
  manifest,
  JSON.stringify({ version: 1, targets: [{ key: "fair", locale: "zh" }] }),
  { mode: 0o600 },
);
fs.writeFileSync(bad, "private-marker", { mode: 0o600 });
const args = [
  "schedule",
  "--auth-file",
  auth,
  "--manifest-file",
  manifest,
  "--state-dir",
  state,
  "--once",
];
const run = (values: string[], env: Record<string, string> = {}) =>
  spawnSync(
    process.execPath,
    ["--import", "tsx", resolve("scripts/exhibition-reminders.ts"), ...values],
    {
      encoding: "utf8",
      timeout: 8000,
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: "/dev/null",
        APP_ENV: "local",
        DATABASE_URL: "",
        PAYLOAD_SECRET: "",
        ...env,
      },
    },
  );
test("schedule parser requires a single explicit once and only the three private inputs", () => {
  assert.deepEqual(parseReminderCommand(args), {
    mode: "schedule",
    authFile: auth,
    manifestFile: manifest,
    stateDir: state,
    once: true,
  });
  for (const values of [
    args.slice(0, -1),
    [...args, "--once"],
    [...args, "true"],
    [...args, "--force", "true"],
    [...args, "--receipt-file", bad],
    args.filter((x) => x !== "--manifest-file"),
    [...args, "--auth-file", auth],
  ])
    assert.throws(() => parseReminderCommand(values));
});
for (const kind of ["once", "auth", "manifest", "existing", "parent", "production", "reset"])
  test("real schedule rejects " + kind + " before config initialization", () => {
    let values = [...args],
      env: Record<string, string> = {};
    if (kind === "once") values = values.slice(0, -1);
    if (kind === "auth") values[2] = bad;
    if (kind === "manifest") values[4] = bad;
    if (kind === "existing") values[6] = dir;
    if (kind === "parent") values[6] = join(dir, "missing-parent", "new");
    if (kind === "production") env = { APP_ENV: "production" };
    if (kind === "reset") env = { PAYLOAD_DROP_DATABASE: "true" };
    const r = run(values, env);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    const pattern =
      kind === "once"
        ? /参数无效/
        : kind === "auth"
          ? /0600/
          : kind === "production"
            ? /仅限/
            : kind === "reset"
              ? /禁止/
              : /私有调度文件或目录/;
    assert.match(r.stderr, pattern);
    assert.doesNotMatch(r.stderr, /private-marker|PAYLOAD_SECRET|DATABASE_URL|Error:/);
  });
test("help shows explicit once without loading Payload", () => {
  const r = run(["--help"], { APP_ENV: "production" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /schedule.*--once/);
  assert.equal(r.stderr, "");
});
test("signal stop keeps first reason and disposes only its own listeners", async () => {
  const path = "../scripts/lib/exhibition-schedule-stop.ts";
  const api = await import(path).catch(() => ({}));
  assert.equal(typeof api.createScheduleStop, "function");
  let foreign = 0;
  const listener = () => {
    foreign++;
  };
  process.on("SIGINT", listener);
  const before = process.listenerCount("SIGINT"),
    stop = api.createScheduleStop();
  try {
    process.emit("SIGINT");
    process.emit("SIGTERM");
    assert.equal(stop.reason, "sigint");
    stop.dispose();
    stop.dispose();
    assert.equal(process.listenerCount("SIGINT"), before);
    assert.equal(foreign, 1);
  } finally {
    stop.dispose();
    process.off("SIGINT", listener);
  }
});
