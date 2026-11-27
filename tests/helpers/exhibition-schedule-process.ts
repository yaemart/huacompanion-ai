import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import type pg from "pg";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { join } from "node:path";
const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.protocol, "postgresql:");
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
assert.ok(
  (url.port === "55442" && url.username === "hua_demo") ||
    (process.env.GITHUB_ACTIONS === "true" && url.port === "55438" && url.username === "hua"),
);
const state = process.env.HUA_SCHEDULE_TEST_DIR!,
  stage = process.env.HUA_SCHEDULE_TEST_STAGE,
  signal = process.env.HUA_SCHEDULE_TEST_SIGNAL as NodeJS.Signals;
assert.ok(state.startsWith(join(fs.realpathSync(process.cwd()), ".local", "schedule-once-")));
if (process.argv[1]?.endsWith("scripts/exhibition-reminders.ts"))
  process.on("exit", (code) => fs.writeFileSync(state + ".exit", String(code), { mode: 0o600 }));
let signaled = false;
const trigger = (phase: string) => {
  if (stage === phase && !signaled) {
    signaled = true;
    process.send?.({ phase: "signal", at: phase });
    process.kill(process.pid, signal);
  }
};
const forbidden = () => {
  fs.appendFileSync(state + ".network", "blocked external attempt\n", { mode: 0o600 });
  process.send?.({ forbidden: true });
  throw Error("No external call in schedule acceptance");
};
globalThis.fetch = async () => forbidden();
http.request = forbidden as typeof http.request;
http.get = forbidden as typeof http.get;
https.request = forbidden as typeof https.request;
https.get = forbidden as typeof https.get;
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    typeof first === "object" && first !== null
      ? (first as { port?: unknown; host?: unknown })
      : null;
  const port = options ? options.port : first,
    host = options?.host ?? (typeof args[1] === "string" ? args[1] : "127.0.0.1");
  if (Number(port) !== Number(url.port) || !["127.0.0.1", "localhost"].includes(String(host)))
    forbidden();
  return (socketConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof socketConnect;
const link = fs.linkSync;
fs.linkSync = ((from, to) => {
  link(from, to);
  if (
    (stage === "prepared-revoke" && String(to) === state + "/operations/000001/prepared.json") ||
    (stage === "applying-revoke" && String(to) === state + "/operations/000001/applying.json")
  ) {
    process.send?.({ phase: "revoke-boundary" });
    const deadline = Date.now() + 15000;
    while (!fs.existsSync(state + ".release")) {
      assert.ok(Date.now() < deadline);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
    process.send?.({ phase: "signal" });
    process.kill(process.pid, signal);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
  }
  if (stage === "npm-publication" && String(to) === state + "/operations/000001/applying.json") {
    fs.writeFileSync(state + ".ready", "ready", { mode: 0o600 });
    const deadline = Date.now() + 15000;
    while (!fs.existsSync(state + ".signal-sent")) {
      assert.ok(Date.now() < deadline);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
  }
  if (String(to) === state + "/started.json" && stage === "replace-inputs") {
    const input = JSON.parse(fs.readFileSync(process.env.HUA_SCHEDULE_TEST_REPLACEMENT!, "utf8"));
    assert.ok(input.auth.startsWith(state.slice(0, state.lastIndexOf("/")) + "/"));
    fs.writeFileSync(input.auth, input.token);
    fs.writeFileSync(input.manifest, JSON.stringify(input.body));
  }
  if (String(to) === state + "/started.json" && stage === "replace-directory") {
    fs.renameSync(state, state + ".original");
    fs.mkdirSync(state, { mode: 0o700 });
  }

  if (String(to).startsWith(state + "/")) trigger(String(to).split("/").pop()!);
}) as typeof link;
syncBuiltinESMExports();
const require = createRequire(import.meta.url),
  dependency = createRequire(require.resolve("@payloadcms/db-postgres"));
const driver = dependency("pg") as typeof import("pg");
let loopPreviews = 0,
  loopApplies = 0;
const log = console.log;
console.log = (...args: unknown[]) => {
  log(...args);
  if (stage?.startsWith("loop-") && typeof args[0] === "string") {
    if (args[0].startsWith("本地预检（"))
      process.send?.({ phase: "loop-preview", count: ++loopPreviews, at: performance.now() });
    if (args[0].startsWith("本地核实结果（"))
      process.send?.({ phase: "loop-apply", count: ++loopApplies, at: performance.now() });
  }
  if (args[0] === "本轮本地处理完成，未发送邮件。") trigger("shutdown");
};
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((
  handler: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
) => {
  if (stage?.startsWith("loop-") && ms === 5000 && loopApplies)
    process.send?.({ phase: "loop-wait", count: loopApplies, at: performance.now() });
  return nativeTimeout(handler, ms, ...args);
}) as typeof setTimeout;
type Callback = (
  err: Error | null,
  client: pg.PoolClient | undefined,
  release: ((err?: Error | boolean) => void) | undefined,
) => void;
type Connect = (this: pg.Pool, callback?: Callback) => Promise<pg.PoolClient> | void;
const connect = driver.Pool.prototype.connect as unknown as Connect,
  checked = new WeakSet<pg.PoolClient>();
const verify = async (client: pg.PoolClient) => {
  if (!checked.has(client)) {
    checked.add(client);
    const statement = (await client.query("SHOW statement_timeout")).rows[0].statement_timeout;
    const lock = (await client.query("SHOW lock_timeout")).rows[0].lock_timeout;
    assert.equal(statement, "10s");
    assert.equal(lock, "10s");
    if (stage === "npm-publication") fs.writeFileSync(state + ".timeouts", "10s", { mode: 0o600 });
    const pid = Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    process.send?.({ phase: "timeouts", pid });
  }
  return client;
};
driver.Pool.prototype.connect = function (this: pg.Pool, callback?: Callback) {
  assert.equal(this.options.statement_timeout, 10000);
  assert.equal(this.options.lock_timeout, 10000);
  assert.equal(this.options.max, 10);
  trigger("connect");
  if (callback)
    return connect.call(this, (err, client, release) => {
      if (err || !client) return callback(err, client, release);
      void verify(client).then(
        () => callback(null, client, release),
        (error) => {
          release?.(true);
          callback(error, undefined, undefined);
        },
      );
    });
  return (connect.call(this) as Promise<pg.PoolClient>).then((client) =>
    verify(client).catch((error) => {
      client.release(true);
      throw error;
    }),
  );
} as typeof driver.Pool.prototype.connect;
