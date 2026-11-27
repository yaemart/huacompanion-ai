import assert from "node:assert/strict";
import fs from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createLocalReq, type Payload } from "payload";
import { withExhibitionScheduler } from "../../src/server/exhibition-reminder-scheduler-control";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import { scheduleTestDirectory } from "./exhibition-schedule-once";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";
import { databaseFingerprints } from "./database-fingerprints";

export async function testExhibitionScheduleSignals(p: Payload) {
  const selected = process.env.HUA_SCHEDULE_ACCEPT_CASE;
  const cases: [string, NodeJS.Signals | undefined][] = [
    ["normal", undefined],
    ["replace-inputs", undefined],
    ["replace-directory", undefined],
    ["lock-revoke", undefined],
  ];
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    for (const stage of [
      "connect",
      "shutdown",
      "run.json",
      "started.json",
      "planned.json",
      "prepared.json",
      "applying.json",
      "finished.json",
      "locked-begin",
      "locked-apply",
    ])
      cases.push([stage, signal]);
  let executed = 0;
  for (const [stage, signal] of cases) {
    if (selected && selected !== stage) continue;
    const f = await recoveryFixture(p),
      root = scheduleTestDirectory(),
      state = join(root, "run");
    const auth = join(root, "admin.jwt"),
      manifest = join(root, "manifest.json"),
      next = f.scope.key + "-next";
    fs.writeFileSync(auth, f.admin.headers.get("authorization")!.slice(4), { mode: 0o600 });
    fs.writeFileSync(
      manifest,
      JSON.stringify({ version: 1, targets: [f.scope, { key: next, locale: "zh" }] }),
      { mode: 0o600 },
    );
    const replacement = join(root, "replacement.json"),
      changed = f.scope.key + "-changed";
    fs.writeFileSync(
      replacement,
      JSON.stringify({
        auth,
        manifest,
        token: f.other.headers.get("authorization")!.slice(4),
        body: { version: 1, targets: [{ key: changed, locale: "zh" }] },
      }),
      { mode: 0o600 },
    );
    const authBefore = fs.readFileSync(auth),
      manifestBefore = fs.readFileSync(manifest),
      types = resolve("payload-types.ts"),
      typesBefore = fs.readFileSync(types),
      typesTime = fs.statSync(types).mtimeMs;
    const old = (await databaseFingerprints(p.db.pool)).filter(
      (t) =>
        ![
          "audit_events",
          "exhibition_reminder_jobs",
          ...(stage === "lock-revoke" ? ["staff", "staff_sessions"] : []),
        ].includes(t.table),
    );
    const blocker = await p.db.pool.connect(),
      barrier = 1986431;
    let child: ReturnType<typeof spawn> | undefined,
      trigger = false;
    try {
      if (stage === "normal")
        await p.db.pool.query("ALTER TABLE audit_events ADD COLUMN schedule_once_probe text");
      if (stage === "locked-begin" || stage === "lock-revoke")
        await blocker.query("SELECT pg_advisory_lock(726271)");
      if (stage === "locked-apply") {
        await blocker.query("SELECT pg_advisory_lock($1)", [barrier]);
        await p.db.pool.query(
          `CREATE FUNCTION schedule_signal_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(1986431); RETURN NEW; END $$`,
        );
        await p.db.pool.query(
          "CREATE TRIGGER schedule_signal_probe BEFORE INSERT ON exhibition_reminder_jobs FOR EACH ROW EXECUTE FUNCTION schedule_signal_probe()",
        );
        trigger = true;
      }
      const messages: { phase?: string; forbidden?: boolean; pid?: number }[] = [];
      child = spawn(
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
          "--once",
        ],
        {
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: {
            ...process.env,
            NODE_ENV: stage === "normal" ? "development" : "production",
            HUA_SCHEDULE_TEST_DIR: state,
            HUA_SCHEDULE_TEST_STAGE: stage,
            HUA_SCHEDULE_TEST_SIGNAL: signal ?? "",
            HUA_SCHEDULE_TEST_REPLACEMENT: replacement,
          },
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout?.on("data", (b) => {
        stdout += b.toString();
      });
      child.stderr?.on("data", (b) => {
        stderr += b.toString();
      });
      child.on("message", (m) => messages.push(m as (typeof messages)[number]));
      const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                Error("Schedule process exceeded acceptance deadline: " + JSON.stringify(messages)),
              ),
            30000,
          );
          child!.once("error", reject);
          child!.once("close", (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
          });
        },
      );
      if (stage === "locked-begin" || stage === "locked-apply" || stage === "lock-revoke") {
        const lock = stage === "locked-begin" || stage === "lock-revoke" ? 726271 : barrier,
          deadline = Date.now() + 15000;
        const pid = Number((await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        while (
          !(
            await p.db.pool.query(
              `SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
               AND locktype='advisory' AND objid=$1 AND NOT granted
               AND $2=ANY(pg_blocking_pids(pid)) AND pid=ANY($3::int[])`,
              [lock, pid, messages.filter((m) => m.phase === "timeouts").map((m) => m.pid)],
            )
          ).rowCount
        ) {
          assert.ok(Date.now() < deadline, "observe actual owned lock barrier: " + stderr);
          await new Promise((r) => setTimeout(r, 10));
        }
        if (stage === "lock-revoke") {
          const revoker = (await p.auth({ headers: f.other.headers })).user;
          assert.ok(revoker);
          await p.update({
            collection: "staff",
            id: f.admin.user.id,
            req: await createLocalReq({ user: revoker }, p),
            data: { active: false },
          });
        } else {
          child.kill(signal!);
          child.kill(signal!);
        }
        await blocker.query("SELECT pg_advisory_unlock_all()");
      }
      const done = await completion;
      assert.equal(done.signal, null, stderr);
      assert.equal(
        done.code,
        ["replace-directory", "lock-revoke"].includes(stage)
          ? 1
          : signal === "SIGINT"
            ? 130
            : signal === "SIGTERM"
              ? 143
              : 0,
        stage + ": " + stderr + JSON.stringify(messages),
      );
      assert.ok(
        messages.some((m) => m.phase === "timeouts"),
        stage,
      );
      assert.equal(
        messages.some((m) => m.forbidden),
        false,
      );
      assert.equal(fs.existsSync(state + ".network"), false);
      if (signal && !stage.startsWith("locked-"))
        assert.ok(
          messages.some((m) => m.phase === "signal"),
          "real signal must fire at requested boundary",
        );
      const after = (await readExhibitionSchedulerStatus(p, f.other.headers)).status;
      const blocked = ["prepared.json", "applying.json"].includes(stage),
        notBegun = ["connect", "run.json", "lock-revoke"].includes(stage);
      const held = [
        "normal",
        "replace-inputs",
        "finished.json",
        "locked-apply",
        "shutdown",
      ].includes(stage)
        ? 1
        : 0;
      assert.equal(
        (
          await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
            JSON.stringify([f.scope.key, f.scope.locale]),
          ])
        ).rowCount,
        held,
        stage,
      );
      assert.equal(after, blocked ? "blocked" : notBegun ? "unregistered" : "idle", stage);
      if (signal && stage !== "shutdown")
        assert.equal(stdout.includes(next), false, "no next target after stop");
      assert.doesNotMatch(stdout + stderr, /JWT |digest|runId|example.invalid/);
      if (stage === "replace-inputs") {
        assert.notDeepEqual(fs.readFileSync(auth), authBefore);
        assert.notDeepEqual(fs.readFileSync(manifest), manifestBefore);
        assert.equal(stdout.includes(changed), false);
        const actor = (
          await p.db.pool.query(
            "SELECT body->>'actor' AS actor FROM exhibition_reminder_jobs WHERE scope=$1",
            [JSON.stringify([f.scope.key, f.scope.locale])],
          )
        ).rows[0].actor;
        assert.equal(Number(actor), f.admin.user.id);
      } else {
        assert.deepEqual(fs.readFileSync(auth), authBefore);
        assert.deepEqual(fs.readFileSync(manifest), manifestBefore);
      }
      if (stage === "replace-directory") assert.deepEqual(fs.readdirSync(state), []);
      assert.deepEqual(fs.readFileSync(types), typesBefore);
      assert.equal(fs.statSync(types).mtimeMs, typesTime);
      if (stage === "normal")
        assert.equal(
          (
            await p.db.pool.query(
              "SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='schedule_once_probe'",
            )
          ).rowCount,
          1,
        );
      if (stage === "lock-revoke")
        assert.equal(
          (
            await p.db.pool.query(
              "SELECT count(*)::int AS n FROM staff_sessions WHERE _parent_id=$1",
              [f.admin.user.id],
            )
          ).rows[0].n,
          0,
        );
      assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
      executed++;
      console.log("VERIFIED actual schedule process: " + stage + " " + (signal ?? "no-signal"));
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await new Promise((r) => child!.once("exit", r));
      }
      await blocker.query("SELECT pg_advisory_unlock_all()");
      blocker.release();
      if (trigger) {
        await p.db.pool.query("DROP TRIGGER schedule_signal_probe ON exhibition_reminder_jobs");
        await p.db.pool.query("DROP FUNCTION schedule_signal_probe()");
      }
      await p.db.pool.query("ALTER TABLE audit_events DROP COLUMN IF EXISTS schedule_once_probe");
      fs.rmSync(root, { recursive: true });
      await f.cleanup();
    }
  }
  assert.equal(
    executed,
    selected ? cases.filter(([stage]) => stage === selected).length : cases.length,
  );
  assert.ok(executed > 0);
  if (!selected) await schedulePeer(p);
}

async function schedulePeer(p: Payload) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory(),
    state = join(root, "peer");
  const auth = join(root, "admin.jwt"),
    manifest = join(root, "manifest.json");
  fs.writeFileSync(auth, f.admin.headers.get("authorization")!.slice(4), { mode: 0o600 });
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, targets: [f.scope] }), { mode: 0o600 });
  try {
    await withExhibitionScheduler(p, f.admin.headers, async () => {
      await f.unchanged(async () => {
        const child = spawnSync(
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
            "--once",
          ],
          {
            encoding: "utf8",
            timeout: 20000,
            env: {
              ...process.env,
              HUA_SCHEDULE_TEST_DIR: state,
              HUA_SCHEDULE_TEST_STAGE: "peer",
              HUA_SCHEDULE_TEST_SIGNAL: "",
            },
          },
        );
        assert.equal(child.status, 1, child.stderr);
        assert.equal(fs.existsSync(state + ".network"), false);
        assert.match(child.stderr, /scheduler-status/);
        assert.equal(fs.existsSync(state), false);
      });
    });
    console.log("VERIFIED two-process schedule singleton refusal");
  } finally {
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
}
