import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createLocalReq, logoutOperation, type Payload } from "payload";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import { scheduleTestDirectory } from "./exhibition-schedule-once";
import { databaseFingerprints } from "./database-fingerprints";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";
import { createScheduleStop } from "../../scripts/lib/exhibition-schedule-stop";
import type { runSchedule } from "../../scripts/lib/exhibition-schedule-runner";
import { runScheduleOnce } from "../../scripts/lib/exhibition-schedule-runner";
import { parseScheduleManifest } from "../../scripts/lib/exhibition-schedule-input";
import { scheduleStopFixture } from "./exhibition-schedule-once";
import { transactionSession } from "../../src/server/db-types";
import { inspectExhibitionReminder } from "../../src/server/exhibition-reminder-history";

type Fixture = Awaited<ReturnType<typeof recoveryFixture>>;
type Phase = { phase?: string; at?: number; count?: number; forbidden?: boolean };
function tree(path: string): unknown[] {
  return fs
    .readdirSync(path)
    .sort()
    .flatMap((name): unknown[] => {
      const full = join(path, name),
        stat = fs.statSync(full);
      return [
        [
          name,
          stat.mode & 0o777,
          stat.ino,
          stat.mtimeMs,
          stat.isDirectory()
            ? tree(full)
            : createHash("sha256").update(fs.readFileSync(full)).digest("hex"),
        ],
      ];
    });
}
async function consent(p: Payload, f: Fixture) {
  return p.create({
    collection: "subscriptions",
    data: {
      email: "loop-new-" + randomUUID() + "@example.invalid",
      topic: "exhibition:" + f.scope.key,
      locale: "zh",
      status: "confirmed",
      consentVersion: 1,
      privacyVersion: "inspection-v1",
      consentedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      sourcePath: "/zh",
    },
  });
}
export async function testExhibitionScheduleLoop(p: Payload) {
  const modulePath = "../../scripts/lib/exhibition-schedule-runner",
    api = await import(modulePath);
  assert.equal(typeof api.runSchedule, "function", "continuous runner must exist");
  const selected = process.env.HUA_LOOP_ACCEPT_CASE;
  const cases: [string, () => Promise<void>][] = [["happy", () => happyCLI(p)]];
  for (const kind of ["sigterm", "logout", "inactive", "role", "expiry"])
    cases.push([kind, () => idleCLI(p, kind)]);
  for (const kind of ["prepare", "apply", "finish"])
    cases.push([kind, () => laterFailure(p, api.runSchedule, kind)]);
  cases.push(["inflight", () => inFlightIdentity(p, api.runSchedule)]);
  let executed = 0;
  for (const [name, work] of cases) {
    if (selected && selected !== name) continue;
    await work();
    executed++;
  }
  assert.equal(executed, selected ? 1 : 10);
}
function launchLoop(
  f: Fixture,
  root: string,
  stage: string,
  token = f.admin.headers.get("authorization")!.slice(4),
) {
  const state = join(root, "run"),
    auth = join(root, "admin.jwt"),
    manifest = join(root, "manifest.json");
  fs.writeFileSync(auth, token, { mode: 0o600 });
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, targets: [f.scope] }), { mode: 0o600 });
  const phases: Phase[] = [];
  const listeners = new Set<(m: Phase) => void>(),
    failures = new Set<(e: Error) => void>();
  let stdout = "",
    stderr = "",
    closed = false;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "./tests/helpers/exhibition-schedule-process.ts",
      "scripts/exhibition-reminders.ts",
      "schedule",
      "--auth-file",
      auth,
      "--manifest-file",
      manifest,
      "--state-dir",
      state,
    ],
    {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        HUA_SCHEDULE_TEST_DIR: state,
        HUA_SCHEDULE_TEST_STAGE: stage,
        HUA_SCHEDULE_TEST_SIGNAL: "",
      },
    },
  );
  child.stdout?.on("data", (b) => {
    stdout += b.toString();
  });
  child.stderr?.on("data", (b) => {
    stderr += b.toString();
  });
  child.on("message", (raw) => {
    const m = raw as Phase;
    phases.push(m);
    for (const listener of listeners) listener(m);
  });
  const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        closed = true;
        for (const fail of failures) fail(Error("CLI closed before expected phase: " + stderr));
        resolve({ code, signal });
      });
    },
  );
  void completion.catch(() => {});
  const phase = (kind: string, count: number) => {
    const existing = phases.find((m) => m.phase === kind && m.count === count);
    if (existing) return Promise.resolve(existing);
    if (closed) return Promise.reject(Error("CLI already closed: " + stderr));
    return new Promise<Phase>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        listeners.delete(listener);
        failures.delete(fail);
      };
      const fail = (e: Error) => {
        cleanup();
        reject(e);
      };
      const listener = (m: Phase) => {
        if (m.phase === kind && m.count === count) {
          cleanup();
          resolve(m);
        }
      };
      const timer = setTimeout(() => fail(Error("Expected actual loop phase " + kind)), 160000);
      listeners.add(listener);
      failures.add(fail);
    });
  };
  return {
    state,
    auth,
    manifest,
    child,
    phases,
    phase,
    completion,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    async close() {
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await completion.catch(() => {});
    },
  };
}
function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Error("controlled loop acceptance deadline")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
async function happyCLI(p: Payload) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory(),
    run = launchLoop(f, root, "loop-happy");
  const { state, auth, manifest, child, phase, completion, phases } = run;
  const old = (await databaseFingerprints(p.db.pool)).filter(
    (t) => !["subscriptions", "audit_events", "exhibition_reminder_jobs"].includes(t.table),
  );
  const extra: number[] = [];
  try {
    const first = await phase("loop-apply", 1);
    assert.ok(fs.existsSync(join(state, "operations", "000001", "finished.json")));
    extra.push((await consent(p, f)).id);
    fs.writeFileSync(auth, f.other.headers.get("authorization")!.slice(4));
    const changed = f.scope.key + "-changed";
    fs.writeFileSync(
      manifest,
      JSON.stringify({ version: 1, targets: [{ key: changed, locale: "en" }] }),
    );
    const second = await phase("loop-preview", 2);
    assert.ok(
      second.at! - first.at! >= 60000,
      "real sixty seconds after completed first operation",
    );
    const applied = await phase("loop-apply", 2);
    assert.ok(applied.at! >= second.at!);
    const held = (
      await p.db.pool.query(
        "SELECT id,subscription_id,body FROM exhibition_reminder_jobs WHERE scope=$1 ORDER BY id",
        [JSON.stringify([f.scope.key, "zh"])],
      )
    ).rows;
    assert.equal(held.length, 2);
    assert.ok(held.some((r) => Number(r.subscription_id) === extra[0]));
    assert.ok(held.every((r) => Number(r.body.actor) === f.admin.user.id));
    const beforeIdle = await databaseFingerprints(p.db.pool),
      files = tree(state);
    const third = await phase("loop-preview", 3);
    assert.ok(third.at! - applied.at! >= 60000);
    assert.deepEqual(
      await databaseFingerprints(p.db.pool),
      beforeIdle,
      "idle round does not write heartbeat or audit",
    );
    assert.deepEqual(tree(state), files, "idle round does not change evidence");
    child.kill("SIGINT");
    child.kill("SIGINT");
    const done = await deadline(completion, 3500);
    assert.deepEqual(done, { code: 130, signal: null }, run.stderr);
    assert.equal((await readExhibitionSchedulerStatus(p, f.admin.headers)).status, "idle");
    assert.ok(fs.existsSync(join(state, "stopped.json")));
    assert.deepEqual(fs.readdirSync(join(state, "operations")), ["000001", "000002"]);
    const controls = (
      await p.db.pool.query(
        "SELECT after,created_at FROM audit_events WHERE entity='exhibition-reminder-scheduler' AND record_id='global' AND actor_id=$1 ORDER BY id",
        [f.admin.user.id],
      )
    ).rows;
    assert.equal(controls.length, 6, "one begin, two prepare/finish pairs, one stop");
    assert.equal(new Set(controls.filter((r) => r.after.runId).map((r) => r.after.runId)).size, 1);
    assert.ok(
      new Date(controls[3].created_at).getTime() - new Date(controls[2].created_at).getTime() >=
        60000,
    );
    assert.equal(run.stdout.includes(changed), false);
    assert.doesNotMatch(run.stdout + run.stderr, /JWT |digest|runId|example.invalid/);
    assert.equal(
      phases.some((m) => m.forbidden),
      false,
    );
    assert.equal(fs.existsSync(state + ".network"), false);
    assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
    console.log(
      "VERIFIED actual continuous CLI: two real sixty-second waits, same-day consent, stable idle, fixed inputs and one run",
    );
  } finally {
    await run.close();
    await p.db.pool.query("DELETE FROM exhibition_reminder_jobs WHERE scope=$1", [
      JSON.stringify([f.scope.key, "zh"]),
    ]);
    for (const id of extra) await p.delete({ collection: "subscriptions", id });
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
}

async function idleCLI(p: Payload, kind: string) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory();
  const actor = (await p.auth({ headers: f.admin.headers })).user,
    revoker = (await p.auth({ headers: f.other.headers })).user;
  assert.ok(actor && revoker);
  let token = f.admin.headers.get("authorization")!.slice(4);
  if (kind === "expiry") {
    const { decodeJwt, decodeProtectedHeader, SignJWT } = await import("jose");
    token = await new SignJWT(decodeJwt(token))
      .setProtectedHeader({
        alg: "HS256",
        typ: "JWT",
        authVersion: decodeProtectedHeader(token).authVersion,
      })
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 20)
      .sign(new TextEncoder().encode(p.secret));
  }
  const run = launchLoop(f, root, "loop-" + kind, token);
  try {
    await run.phase("loop-apply", 1);
    await run.phase("loop-wait", 1);
    const before = await readExhibitionSchedulerStatus(p, f.other.headers);
    const old = (await databaseFingerprints(p.db.pool)).filter(
      (t) =>
        ![
          "audit_events",
          ...(kind === "logout" || kind === "inactive" || kind === "role"
            ? ["staff", "staff_sessions"]
            : []),
        ].includes(t.table),
    );
    if (kind === "sigterm") {
      run.child.kill("SIGTERM");
      run.child.kill("SIGTERM");
    } else if (kind === "logout")
      await logoutOperation({
        collection: p.collections.staff,
        req: await createLocalReq({ user: actor }, p),
      });
    else if (kind === "inactive" || kind === "role")
      await p.update({
        collection: "staff",
        id: actor.id,
        req: await createLocalReq({ user: revoker }, p),
        data: kind === "inactive" ? { active: false } : { role: "operations" },
      });
    const done = await deadline(run.completion, kind === "sigterm" ? 3500 : 30000);
    assert.deepEqual(done, { code: kind === "sigterm" ? 143 : 1, signal: null }, run.stderr);
    const after = await readExhibitionSchedulerStatus(p, f.other.headers);
    assert.equal(after.status, kind === "sigterm" ? "idle" : "running");
    if (kind !== "sigterm") {
      assert.equal(
        after.revision,
        before.revision,
        "invalid actor cannot append stop control audit",
      );
      assert.equal(
        (await p.auth({ headers: new Headers({ authorization: "JWT " + token }) })).user,
        null,
      );
      assert.match(run.stderr, /管理员登录或权限无效/);
    }
    assert.equal(fs.existsSync(join(run.state, "stopped.json")), kind === "sigterm");
    assert.equal(run.phases.filter((m) => m.phase === "loop-preview").length, 1);
    assert.equal(run.phases.filter((m) => m.phase === "loop-apply").length, 1);
    assert.deepEqual(fs.readdirSync(join(run.state, "operations")), ["000001"]);
    assert.equal(
      (
        await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
          JSON.stringify([f.scope.key, "zh"]),
        ])
      ).rowCount,
      1,
    );
    assert.equal(fs.existsSync(run.state + ".network"), false);
    assert.doesNotMatch(run.stdout + run.stderr, /JWT |digest|runId|example.invalid/);
    if (kind !== "sigterm") assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
    console.log("VERIFIED actual continuous idle CLI: " + kind);
  } finally {
    await run.close();
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
}

async function laterFailure(p: Payload, run: typeof runSchedule, kind: string) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory(),
    state = join(root, "run"),
    stop = createScheduleStop();
  const commit = p.db.commitTransaction,
    extra: number[] = [],
    receipts: string[] = [];
  let applies = 0,
    injected = false,
    firstTime = 0,
    secondTime = 0,
    ready!: () => void;
  const first = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const work = run(
    p,
    f.admin.headers,
    parseScheduleManifest({ version: 1, targets: [f.scope] }),
    state,
    stop,
    (r) => {
      if (r.mode === "preview") {
        receipts.push(r.report.receipt!);
        if (receipts.length === 2) secondTime = performance.now();
      } else {
        applies++;
        if (applies === 1) {
          firstTime = performance.now();
          ready();
        }
      }
    },
    { once: false },
  );
  const failure = assert.rejects(work);
  void failure.catch(() => {});
  try {
    await deadline(first, 15000);
    const original = (
      await p.db.pool.query(
        "SELECT id,body FROM exhibition_reminder_jobs WHERE scope=$1 ORDER BY id",
        [JSON.stringify([f.scope.key, "zh"])],
      )
    ).rows[0];
    extra.push((await consent(p, f)).id);
    p.db.commitTransaction = async (incoming) => {
      const id = await incoming;
      assert.ok(id);
      const db = transactionSession(p, id).db;
      const row = (await db.execute("SELECT entity FROM audit_events ORDER BY id DESC LIMIT 1"))
        .rows[0];
      const states = (
        await db.execute(
          "SELECT after FROM audit_events WHERE entity='exhibition-reminder-scheduler' AND record_id='global' ORDER BY id DESC LIMIT 2",
        )
      ).rows as { after: { pending: unknown; runId: string | null } }[];
      const current =
        row?.entity === "exhibition-reminder-jobs"
          ? "apply"
          : row?.entity === "exhibition-reminder-scheduler"
            ? states[0]?.after.pending
              ? "prepare"
              : states[0]?.after.runId && states[1]?.after.pending
                ? "finish"
                : "other"
            : "other";
      await commit.call(p.db, id);
      if (!injected && current === kind) {
        injected = true;
        throw Error("Second-round committed response lost");
      }
    };
    await deadline(failure, 85000);
    p.db.commitTransaction = commit;
    assert.ok(injected, kind);
    assert.ok(secondTime - firstTime >= 60000, "fault is in a real later round");
    assert.equal(applies, 1, "unknown operation never reports completed apply");
    assert.equal(receipts.length, 2);
    const after = await readExhibitionSchedulerStatus(p, f.admin.headers);
    assert.equal(after.status, kind === "finish" ? "running" : "blocked");
    const held = (
      await p.db.pool.query(
        "SELECT id,body FROM exhibition_reminder_jobs WHERE scope=$1 ORDER BY id",
        [JSON.stringify([f.scope.key, "zh"])],
      )
    ).rows;
    assert.equal(held.length, kind === "prepare" ? 1 : 2);
    assert.deepEqual(held[0], original, "prior committed history survives a later failure");
    await f.unchanged(async () => {
      assert.equal(
        (await inspectExhibitionReminder(p, f.admin.headers, receipts[0])).state,
        "committed",
      );
      assert.equal(
        (await inspectExhibitionReminder(p, f.admin.headers, receipts[1])).state,
        kind === "prepare" ? "not-found" : "committed",
      );
    });
    assert.equal(fs.existsSync(join(state, "operations", "000002", "finished.json")), false);
    assert.equal(fs.existsSync(join(state, "stopped.json")), false);
    if (kind !== "finish") {
      const next = join(root, "replacement");
      await f.unchanged(async () => {
        await assert.rejects(
          runScheduleOnce(
            p,
            f.admin.headers,
            parseScheduleManifest({ version: 1, targets: [f.scope] }),
            next,
            scheduleStopFixture(),
            () => {},
          ),
          { status: 409 },
        );
      });
      assert.equal(fs.existsSync(next), false);
    }
    console.log("VERIFIED later-round real COMMIT response loss: " + kind);
  } finally {
    p.db.commitTransaction = commit;
    stop.request("sigterm");
    await deadline(work, 15000).catch(() => {});
    stop.dispose();
    await p.db.pool.query("DELETE FROM exhibition_reminder_jobs WHERE scope=$1", [
      JSON.stringify([f.scope.key, "zh"]),
    ]);
    for (const id of extra) await p.delete({ collection: "subscriptions", id });
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
}

async function inFlightIdentity(p: Payload, run: typeof runSchedule) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory(),
    stop = createScheduleStop(),
    native = p.auth;
  const revoker = (await p.auth({ headers: f.other.headers })).user;
  assert.ok(revoker);
  const blocker = await p.db.pool.connect(),
    check = await p.db.pool.connect(),
    key = 1986477;
  const pid = Number((await check.query("SELECT pg_backend_pid() AS pid")).rows[0].pid),
    owner = Number((await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  await blocker.query("SELECT pg_advisory_lock($1)", [key]);
  let applied = false,
    blocked = false,
    inFlight = false,
    firstReady!: () => void,
    checkReady!: () => void;
  const first = new Promise<void>((r) => {
      firstReady = r;
    }),
    entered = new Promise<void>((r) => {
      checkReady = r;
    });
  p.auth = async (args) => {
    const target = args.headers.get("authorization") === f.admin.headers.get("authorization");
    assert.ok(
      !target || !inFlight,
      "do not start a second auth while the first native check is blocked",
    );
    const user = await native.call(p, args);
    if (target && applied && !blocked) {
      blocked = true;
      inFlight = true;
      checkReady();
      await check.query("SELECT pg_advisory_lock($1)", [key]);
      await check.query("SELECT pg_advisory_unlock($1)", [key]);
      inFlight = false;
    }
    return user;
  };
  const work = run(
    p,
    f.admin.headers,
    parseScheduleManifest({ version: 1, targets: [f.scope] }),
    join(root, "run"),
    stop,
    (r) => {
      if (r.mode === "apply") {
        applied = true;
        firstReady();
      }
    },
    { once: false },
  );
  const failure = assert.rejects(work, { status: 403 });
  void failure.catch(() => {});
  try {
    await deadline(first, 15000);
    const before = await readExhibitionSchedulerStatus(p, f.other.headers);
    await deadline(entered, 12000);
    const until = Date.now() + 10000;
    while (
      !(
        await p.db.pool.query(
          `SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
       AND locktype='advisory' AND objid=$1 AND pid=$2 AND NOT granted AND $3=ANY(pg_blocking_pids(pid))`,
          [key, pid, owner],
        )
      ).rowCount
    ) {
      assert.ok(Date.now() < until, "observe exact native-check PG barrier");
      await new Promise((r) => setTimeout(r, 10));
    }
    await p.update({
      collection: "staff",
      id: f.admin.user.id,
      req: await createLocalReq({ user: revoker }, p),
      data: { active: false },
    });
    await new Promise<void>((resolve) => {
      process.once("SIGTERM", resolve);
      process.kill(process.pid, "SIGTERM");
    });
    assert.equal(stop.reason, "sigterm");
    await blocker.query("SELECT pg_advisory_unlock($1)", [key]);
    await deadline(failure, 15000);
    const after = await readExhibitionSchedulerStatus(p, f.other.headers);
    assert.equal(after.revision, before.revision);
    assert.equal(after.status, "running");
    assert.equal(fs.existsSync(join(root, "run", "stopped.json")), false);
    assert.equal(
      (
        await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
          JSON.stringify([f.scope.key, "zh"]),
        ])
      ).rowCount,
      1,
    );
    console.log(
      "VERIFIED real in-flight native identity/PG barrier: revocation error wins delivered SIGTERM",
    );
  } finally {
    await blocker.query("SELECT pg_advisory_unlock_all()");
    stop.request("sigterm");
    await deadline(work, 15000).catch(() => {});
    p.auth = native;
    stop.dispose();
    check.release(true);
    blocker.release();
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
}
