import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { createLocalReq, logoutOperation, type Payload } from "payload";
import { transactionSession } from "../../src/server/db-types";
import { inspectExhibitionReminder } from "../../src/server/exhibition-reminder-history";
import type { runScheduleOnce, ScheduleStop } from "../../scripts/lib/exhibition-schedule-runner";
import { parseScheduleManifest } from "../../scripts/lib/exhibition-schedule-input";
import { readReminderFile } from "../../scripts/lib/exhibition-reminder-command";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import { databaseFingerprints } from "./database-fingerprints";
import { createScheduleStop } from "../../scripts/lib/exhibition-schedule-stop";

export function scheduleStopFixture(): ScheduleStop {
  const listeners = new Set<() => void>();
  return {
    reason: null,
    request(reason) {
      if (this.reason) return;
      this.reason = reason;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    onRequest(listener) {
      if (this.reason) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export function scheduleTestDirectory() {
  const local = join(fs.realpathSync(process.cwd()), ".local");
  fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  return fs.mkdtempSync(join(local, "schedule-once-"));
}
export async function testExhibitionScheduleOnce(p: Payload) {
  const path = "../../scripts/lib/exhibition-schedule-runner";
  const api = await import(path).catch(() => ({}));
  assert.equal(typeof api.runScheduleOnce, "function", "controlled single round must exist");
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory();
  try {
    const manifest = parseScheduleManifest({ version: 1, targets: [f.scope] }),
      run = join(root, "first");
    const old = (await databaseFingerprints(p.db.pool)).filter(
      (t) => !["audit_events", "exhibition_reminder_jobs"].includes(t.table),
    );
    let originalReceipt = "";
    const result = await api.runScheduleOnce(
      p,
      f.admin.headers,
      manifest,
      run,
      scheduleStopFixture(),
      (r: { mode: string; report: { receipt?: string } }) => {
        if (r.mode === "preview") originalReceipt = r.report.receipt!;
        else
          assert.ok(
            fs.existsSync(join(run, "operations", "000001", "finished.json")),
            "never announce apply before durable finish",
          );
      },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(
      (
        await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
          JSON.stringify([f.scope.key, f.scope.locale]),
        ])
      ).rowCount,
      1,
    );
    assert.equal((await readExhibitionSchedulerStatus(p, f.admin.headers)).status, "idle");
    assert.equal(
      readReminderFile(join(run, "operations", "000001", "receipt"), "receipt"),
      originalReceipt,
    );
    assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
    const second = join(root, "no-changes");
    assert.equal(
      (
        await api.runScheduleOnce(
          p,
          f.admin.headers,
          manifest,
          second,
          scheduleStopFixture(),
          () => {},
        )
      ).exitCode,
      0,
    );
    assert.deepEqual(fs.readdirSync(join(second, "operations")), []);
    assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
  } finally {
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
  await onceFailures(p, api.runScheduleOnce);
  await onceAuthority(p, api.runScheduleOnce);
  await oncePendingStop(p, api.runScheduleOnce);
}

async function oncePendingStop(p: Payload, runOnce: typeof runScheduleOnce) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const f = await recoveryFixture(p),
      root = scheduleTestDirectory(),
      state = join(root, "run");
    const stop = createScheduleStop(),
      commit = p.db.commitTransaction;
    const revoker = (await p.auth({ headers: f.other.headers })).user;
    assert.ok(revoker);
    let injected = false,
      preparedRevision = 0;
    p.db.commitTransaction = async (incoming) => {
      const id = await incoming;
      assert.ok(id);
      const row = (
        await transactionSession(p, id).db.execute(
          "SELECT id, after FROM audit_events WHERE entity='exhibition-reminder-scheduler' AND record_id='global' ORDER BY id DESC LIMIT 1",
        )
      ).rows[0] as { id: number; after: { pending: unknown } } | undefined;
      await commit.call(p.db, id);
      if (!injected && row?.after?.pending) {
        injected = true;
        preparedRevision = Number(row.id);
        await p.update({
          collection: "staff",
          id: f.admin.user.id,
          req: await createLocalReq({ user: revoker }, p),
          data: { active: false },
        });
        await new Promise<void>((resolve) => {
          process.once(signal, resolve);
          process.kill(process.pid, signal);
        });
      }
    };
    try {
      await assert.rejects(
        runOnce(
          p,
          f.admin.headers,
          parseScheduleManifest({ version: 1, targets: [f.scope] }),
          state,
          stop,
          () => {},
        ),
        { status: 403 },
      );
      assert.ok(injected);
      const status = await readExhibitionSchedulerStatus(p, f.other.headers);
      assert.equal(status.status, "blocked");
      assert.equal(
        status.revision,
        preparedRevision,
        "no finish or stop control audit after revocation",
      );
      assert.equal(
        (
          await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
            JSON.stringify([f.scope.key, f.scope.locale]),
          ])
        ).rowCount,
        0,
      );
      assert.equal(fs.existsSync(join(state, "stopped.json")), false);
      assert.equal(fs.existsSync(join(state, "operations", "000001", "finished.json")), false);
      console.log("VERIFIED pending native revocation with delivered " + signal);
    } finally {
      p.db.commitTransaction = commit;
      stop.dispose();
      fs.rmSync(root, { recursive: true });
      await f.cleanup();
    }
  }
}

async function onceFailures(p: Payload, runOnce: typeof runScheduleOnce) {
  const cases = [
    ["planned-file", "running", 0],
    ["prepared-file", "blocked", 0],
    ["applying-file", "blocked", 0],
    ["finished-file", "running", 1],
    ["prepare-constraint", "running", 0],
    ["prepare-swallow", "running", 0],
    ["prepare-lost", "blocked", 0],
    ["apply-lost", "blocked", 1],
    ["finish-swallow", "blocked", 1],
    ["finish-lost", "running", 1],
  ] as const;
  for (const [mode, expected, held] of cases) {
    const f = await recoveryFixture(p),
      root = scheduleTestDirectory(),
      state = join(root, "run");
    const commit = p.db.commitTransaction,
      link = fs.linkSync;
    let injected = false,
      reported = 0,
      receipt = "";
    const old = (await databaseFingerprints(p.db.pool)).filter(
      (t) => !["audit_events", "exhibition_reminder_jobs"].includes(t.table),
    );
    try {
      if (mode.endsWith("-file"))
        fs.linkSync = ((from, to) => {
          if (
            String(to).startsWith(state + "/") &&
            String(to).endsWith("/" + mode.replace("-file", ".json"))
          ) {
            injected = true;
            throw Error("File publication failure");
          }
          return link(from, to);
        }) as typeof link;
      if (mode === "prepare-constraint")
        await p.db.pool.query(
          "ALTER TABLE audit_events ADD CONSTRAINT once_probe CHECK(NOT(entity='exhibition-reminder-scheduler' AND action='pending-v1')) NOT VALID",
        );
      else
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
          const kind =
            row?.entity === "exhibition-reminder-jobs"
              ? "apply"
              : states[0]?.after.pending
                ? "prepare"
                : states[0]?.after.runId && states[1]?.after.pending
                  ? "finish"
                  : "other";
          if (!injected && mode.startsWith(kind + "-")) {
            injected = true;
            if (mode.endsWith("-swallow")) return p.db.rollbackTransaction(id);
            await commit.call(p.db, id);
            throw Error("Committed response lost");
          }
          return commit.call(p.db, id);
        };
      await assert.rejects(
        runOnce(
          p,
          f.admin.headers,
          parseScheduleManifest({ version: 1, targets: [f.scope] }),
          state,
          scheduleStopFixture(),
          (r) => {
            if (r.mode === "preview") receipt = r.report.receipt!;
            else reported++;
          },
        ),
      );
    } finally {
      p.db.commitTransaction = commit;
      fs.linkSync = link;
      await p.db.pool.query("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS once_probe");
    }
    try {
      assert.ok(injected || mode === "prepare-constraint", mode);
      assert.equal(reported, 0, mode + " cannot announce completed apply");
      assert.equal(
        (await readExhibitionSchedulerStatus(p, f.admin.headers)).status,
        expected,
        mode,
      );
      assert.equal(
        (
          await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
            JSON.stringify([f.scope.key, f.scope.locale]),
          ])
        ).rowCount,
        held,
        mode,
      );
      assert.equal(fs.existsSync(join(state, "stopped.json")), false);
      assert.deepEqual(await databaseFingerprints(p.db.pool, old), old);
      if (expected === "blocked") {
        const second = join(root, "new-directory");
        await f.unchanged(async () => {
          await assert.rejects(
            runOnce(
              p,
              f.admin.headers,
              parseScheduleManifest({ version: 1, targets: [f.scope] }),
              second,
              scheduleStopFixture(),
              () => {},
            ),
            { status: 409 },
          );
        });
        assert.equal(fs.existsSync(second), false);
      }
      if (held)
        await f.unchanged(async () => {
          assert.equal(
            (await inspectExhibitionReminder(p, f.admin.headers, receipt)).state,
            "committed",
          );
        });
    } finally {
      fs.rmSync(root, { recursive: true });
      await f.cleanup();
    }
  }
}

async function onceAuthority(p: Payload, runOnce: typeof runScheduleOnce) {
  const f = await recoveryFixture(p),
    root = scheduleTestDirectory();
  try {
    const roles = [
      f.manager,
      await f.person("editor"),
      await f.person("operations"),
      await f.person("reviewer"),
    ];
    for (const [i, headers] of [new Headers(), ...roles.map((r) => r.headers)].entries()) {
      const path = join(root, "denied-" + i);
      await f.unchanged(async () => {
        await assert.rejects(
          runOnce(
            p,
            headers,
            parseScheduleManifest({ version: 1, targets: [f.scope] }),
            path,
            scheduleStopFixture(),
            () => {},
          ),
          { status: 403 },
        );
      });
      assert.equal(fs.existsSync(path), false);
    }
    const { decodeJwt, decodeProtectedHeader, SignJWT } = await import("jose"),
      raw = f.admin.headers.get("authorization")!.slice(4);
    const token = await new SignJWT(decodeJwt(raw))
      .setProtectedHeader({
        alg: "HS256",
        typ: "JWT",
        authVersion: decodeProtectedHeader(raw).authVersion,
      })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 8000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(new TextEncoder().encode(p.secret));
    await f.unchanged(async () => {
      await assert.rejects(
        runOnce(
          p,
          new Headers({ authorization: "JWT " + token }),
          parseScheduleManifest({ version: 1, targets: [f.scope] }),
          join(root, "expired"),
          scheduleStopFixture(),
          () => {},
        ),
        { status: 403 },
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true });
    await f.cleanup();
  }
  for (const kind of ["logout", "inactive"]) {
    const f = await recoveryFixture(p),
      root = scheduleTestDirectory(),
      state = join(root, "run"),
      auth = p.auth;
    const actor = (await auth.call(p, { headers: f.admin.headers })).user,
      revoker = (await auth.call(p, { headers: f.other.headers })).user;
    assert.ok(actor && revoker);
    let changed = false;
    p.auth = async (args) => {
      if (!changed && fs.existsSync(join(state, "operations", "000001", "planned.json"))) {
        changed = true;
        if (kind === "logout")
          await logoutOperation({
            collection: p.collections.staff,
            req: await createLocalReq({ user: actor }, p),
          });
        else
          await p.update({
            collection: "staff",
            id: f.admin.user.id,
            req: await createLocalReq({ user: revoker }, p),
            data: { active: false },
          });
      }
      return auth.call(p, args);
    };
    try {
      await assert.rejects(
        runOnce(
          p,
          f.admin.headers,
          parseScheduleManifest({ version: 1, targets: [f.scope] }),
          state,
          scheduleStopFixture(),
          () => {},
        ),
        { status: 403 },
      );
      assert.ok(changed);
      assert.equal(
        (
          await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
            JSON.stringify([f.scope.key, f.scope.locale]),
          ])
        ).rowCount,
        0,
      );
      assert.equal((await readExhibitionSchedulerStatus(p, f.other.headers)).status, "running");
      assert.equal(fs.existsSync(join(state, "stopped.json")), false);
    } finally {
      p.auth = auth;
      fs.rmSync(root, { recursive: true });
      await f.cleanup();
    }
  }
}
