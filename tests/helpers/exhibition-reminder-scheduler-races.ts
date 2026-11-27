import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createLocalReq, type Payload } from "payload";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import {
  applyExhibitionReminders,
  previewExhibitionReminders,
} from "../../src/server/exhibition-reminders";
import { withExhibitionScheduler } from "../../src/server/exhibition-reminder-scheduler-control";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";
import { reminderHash } from "../../src/lib/exhibition-reminders";

export async function testExhibitionSchedulerRaces(p: Payload) {
  const f = await recoveryFixture(p);
  try {
    // Trusted persisted control fixture, before a resolve implementation exists:
    // removing the guard must really produce a held record from this valid seal.
    await p.create({
      collection: "audit-events",
      data: {
        entity: "exhibition-reminder-scheduler",
        recordId: reminderHash(f.receipt),
        action: "closed-uncommitted-v1",
        actor: f.admin.user.id,
        after: {
          version: 1,
          runId: "00000000-0000-4000-8000-000000000001",
          originalActor: f.admin.user.id,
          scope: f.scope,
          reason: "Fictional close",
        },
      },
    });
    await p.create({
      collection: "audit-events",
      data: {
        entity: "exhibition-reminder-scheduler",
        recordId: "global",
        action: "state-v1",
        actor: f.admin.user.id,
        after: { version: 1, runId: null, owner: null, targets: [], pending: null },
      },
    });
    await f.unchanged(async () => {
      const call = applyExhibitionReminders(p, f.admin.headers, f.receipt);
      try {
        await assert.rejects(call, { status: 409 });
      } catch (error) {
        const accidental = await call;
        assert.equal(accidental.counts.create, 1);
        assert.equal(
          (
            await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
              JSON.stringify([f.scope.key, f.scope.locale]),
            ])
          ).rowCount,
          1,
        );
        console.log("NEGATIVE guard removal created exactly one held record");
        throw error;
      }
    });
    const apiPath = "../../src/server/exhibition-reminder-scheduler-control";
    const api = await import(apiPath);
    let revision = 0;
    await withExhibitionScheduler(p, f.admin.headers, async (s) => {
      const { runId } = await s.begin([f.scope]);
      const fresh = await previewExhibitionReminders(p, f.admin.headers, f.scope);
      // A new seal must differ from the deliberately closed fixture.
      assert.ok(fresh.receipt && fresh.receipt !== f.receipt);
      revision = (await s.prepare(runId, fresh.receipt)).revision;
    });
    await f.unchanged(async () => {
      await assert.rejects(
        api.withExhibitionScheduler(
          p,
          f.manager.headers,
          async (s: { resolve: (v: number, why: string) => Promise<unknown> }) =>
            s.resolve(revision, "no"),
        ),
        { status: 403 },
      );
    });
    for (const reason of [" ", "x".repeat(501)])
      await f.unchanged(async () => {
        await assert.rejects(
          api.withExhibitionScheduler(
            p,
            f.other.headers,
            async (s: { resolve: (v: number, why: string) => Promise<unknown> }) =>
              s.resolve(revision, reason),
          ),
          { status: 400 },
        );
      });
    const revoker = (await p.auth({ headers: f.other.headers })).user;
    assert.ok(revoker);
    await p.update({
      collection: "staff",
      id: f.admin.user.id,
      data: { active: false },
      req: await createLocalReq({ user: revoker }, p),
    });
    const files = mkdtempSync(join(tmpdir(), "hua resolve private-"));
    try {
      const auth = join(files, "other.jwt"),
        marker = join(files, "network"),
        receipt = join(files, "old.receipt");
      writeFileSync(auth, f.other.headers.get("authorization")!.slice(4), { mode: 0o600 });
      writeFileSync(receipt, f.receipt, { mode: 0o600 });
      const authBefore = readFileSync(auth),
        receiptBefore = readFileSync(receipt);
      const cli = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          "./tests/helpers/exhibition-reminder-command-session.ts",
          "scripts/exhibition-reminders.ts",
          "scheduler-resolve",
          "--auth-file",
          auth,
          "--revision",
          String(revision),
          "--reason",
          "Fictional CLI verification",
        ],
        {
          encoding: "utf8",
          timeout: 20000,
          env: { ...process.env, HUA_REMINDER_COMMAND_NETWORK_PROBE: marker },
        },
      );
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /已核实结束/);
      assert.doesNotMatch(
        cli.stdout + cli.stderr,
        /JWT |example.invalid|Fictional CLI verification|digest|runId/,
      );
      assert.deepEqual(readFileSync(auth), authBefore);
      assert.deepEqual(readFileSync(receipt), receiptBefore);
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(files, { recursive: true });
    }
    await f.unchanged(async () => {
      await assert.rejects(applyExhibitionReminders(p, f.other.headers, f.receipt));
    });
    assert.equal((await readExhibitionSchedulerStatus(p, f.other.headers)).status, "idle");
    const freshOther = await previewExhibitionReminders(p, f.other.headers, f.scope);
    let nextRevision = 0;
    await withExhibitionScheduler(p, f.other.headers, async (s) => {
      const { runId } = await s.begin([f.scope]);
      nextRevision = (await s.prepare(runId, freshOther.receipt!)).revision;
    });
    const attempts = await Promise.allSettled(
      [0, 1].map(() =>
        api.withExhibitionScheduler(
          p,
          f.other.headers,
          async (s: { resolve: (v: number, why: string) => Promise<unknown> }) =>
            s.resolve(nextRevision, "Fictional operator verification"),
        ),
      ),
    );
    const successes = attempts.filter((r) => r.status === "fulfilled");
    assert.equal(successes.length, 1);
    const result = successes[0].value as { outcome: string };
    const refused = attempts.find((r) => r.status === "rejected");
    assert.equal(refused?.reason.status, 409);
    assert.equal(result.outcome, "closed-uncommitted");
    assert.deepEqual(Object.keys(result).sort(), ["outcome", "revision", "scope", "state"]);
    assert.equal((await readExhibitionSchedulerStatus(p, f.other.headers)).status, "idle");
  } finally {
    await f.cleanup();
  }
  for (const order of ["resolve-first", "generate-first"]) {
    const f = await recoveryFixture(p);
    const dir = mkdtempSync(join(tmpdir(), "hua-control-process-"));
    const input = join(dir, "input.json");
    writeFileSync(
      input,
      JSON.stringify({
        mode: order,
        scope: f.scope,
        receipt: f.receipt,
        authorization: f.admin.headers.get("authorization"),
      }),
      { mode: 0o600 },
    );
    const deadline = setTimeout(() => {
      throw Error("Process acceptance deadline");
    }, 45000);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/helpers/exhibition-reminder-control-process.ts", input],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] },
    );
    const messages: { phase: string; revision?: number; lockPid?: number }[] = [];
    child.on("message", (m) =>
      messages.push(m as { phase: string; revision?: number; lockPid?: number }),
    );
    let errors = "";
    child.stderr?.on("data", (b) => {
      errors += b.toString();
    });
    const until = async (condition: () => Promise<boolean>) => {
      const end = Date.now() + 25000;
      while (!(await condition())) {
        if (Date.now() > end || child.exitCode !== null) throw Error("Barrier failed: " + errors);
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    try {
      await until(async () => messages.some((m) => m.phase === "prepared"));
      const revision = messages.find((m) => m.phase === "prepared")!.revision!;
      await f.unchanged(async () => {
        await assert.rejects(
          withExhibitionScheduler(p, f.other.headers, async () => {}),
          { status: 409 },
        );
      });
      const lock = messages.find((m) => m.phase === "prepared")!.lockPid!;
      assert.ok(Number.isSafeInteger(lock) && lock > 0);
      assert.equal(
        (
          await p.db.pool.query(
            `SELECT 1 FROM pg_locks WHERE pid=$1
               AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
               AND locktype='advisory' AND objid=726291 AND granted`,
            [lock],
          )
        ).rowCount,
        1,
      );
      if (order === "generate-first") {
        child.send("apply");
        await until(async () => messages.some((m) => m.phase === "write-locked"));
      }
      assert.equal(
        (
          await p.db.pool.query(
            `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE pid=$1
               AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
               AND locktype='advisory' AND objid=726291 AND granted`,
            [lock],
          )
        ).rowCount,
        1,
      );
      await until(
        async () =>
          !(
            await p.db.pool.query(
              "SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND objid=726291 AND granted",
            )
          ).rowCount,
      );
      const resolving = withExhibitionScheduler(p, f.other.headers, (s) =>
        s.resolve(revision, "Fictional barrier verification"),
      );
      if (order === "generate-first") {
        await until(async () =>
          Boolean(
            (
              await p.db.pool.query(
                `SELECT 1 FROM pg_locks l WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
                 AND locktype='advisory' AND objid=726271 AND NOT granted AND cardinality(pg_blocking_pids(l.pid))>0`,
              )
            ).rowCount,
          ),
        );
        child.send("commit");
      }
      const result = await resolving;
      assert.equal(result.outcome, order === "generate-first" ? "committed" : "closed-uncommitted");
      if (order === "resolve-first") child.send("apply");
      await until(async () =>
        messages.some((m) => m.phase === (order === "generate-first" ? "committed" : "rejected")),
      );
      console.log("VERIFIED real process barrier: " + order);
      const jobs = await p.db.pool.query("SELECT id FROM exhibition_reminder_jobs WHERE scope=$1", [
        JSON.stringify([f.scope.key, f.scope.locale]),
      ]);
      assert.equal(jobs.rowCount, order === "generate-first" ? 1 : 0);
      await f.unchanged(async () => {
        await assert.rejects(
          withExhibitionScheduler(p, f.other.headers, (s) => s.resolve(revision, "Stale version")),
          { status: 409 },
        );
      });
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => child.once("exit", r));
      }
      rmSync(dir, { recursive: true });
      await f.cleanup();
    }
  }
  {
    const f = await recoveryFixture(p);
    const blocker = await p.db.pool.connect();
    try {
      let revision = 0;
      await withExhibitionScheduler(p, f.admin.headers, async (s) => {
        const { runId } = await s.begin([f.scope]);
        revision = (await s.prepare(runId, f.receipt)).revision;
      });
      await blocker.query("SELECT pg_advisory_lock(726271)");
      const waiting = withExhibitionScheduler(p, f.other.headers, (s) =>
        s.resolve(revision, "Lock-wait authority check"),
      );
      const rejected = assert.rejects(waiting, { status: 403 });
      const expires = Date.now() + 10000;
      while (
        !(
          await p.db.pool.query(
            "SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND objid=726271 AND NOT granted",
          )
        ).rowCount
      ) {
        assert.ok(Date.now() < expires, "observe actual resolve lock wait");
        await new Promise((r) => setTimeout(r, 10));
      }
      const revoker = (await p.auth({ headers: f.admin.headers })).user;
      assert.ok(revoker);
      await p.update({
        collection: "staff",
        id: f.other.user.id,
        data: { active: false },
        req: await createLocalReq({ user: revoker }, p),
      });
      await blocker.query("SELECT pg_advisory_unlock(726271)");
      await rejected;
      assert.equal((await readExhibitionSchedulerStatus(p, f.admin.headers)).status, "blocked");
    } finally {
      await blocker.query("SELECT pg_advisory_unlock_all()");
      blocker.release();
      await f.cleanup();
    }
  }
}
