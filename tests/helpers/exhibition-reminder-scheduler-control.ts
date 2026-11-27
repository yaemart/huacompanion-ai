import assert from "node:assert/strict";
import type { Payload } from "payload";
import type { SchedulerSession } from "../../src/server/exhibition-reminder-scheduler-control";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";

export async function testExhibitionSchedulerControl(p: Payload) {
  const path = "../../src/server/exhibition-reminder-scheduler-control";
  const api = await import(path);
  const scenario = async (
    work: (
      f: Awaited<ReturnType<typeof recoveryFixture>>,
      s: SchedulerSession,
      run: string,
    ) => Promise<void>,
  ) => {
    const f = await recoveryFixture(p);
    try {
      await api.withExhibitionScheduler(p, f.admin.headers, async (s: SchedulerSession) => {
        const { runId } = await s.begin([f.scope]);
        await work(f, s, runId);
      });
    } finally {
      await f.cleanup();
    }
  };
  await scenario(async (f, s, run) => {
    await assert.rejects(
      api.withExhibitionScheduler(p, f.other.headers, async () => {}),
      { status: 409 },
    );
    const held = await p.db.pool.query(
      "SELECT pid FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND objid=726291 AND granted",
    );
    assert.equal(held.rowCount, 1);
    await s.prepare(run, f.receipt);
    await f.unchanged(async () => {
      assert.equal((await readExhibitionSchedulerStatus(p, f.other.headers)).status, "blocked");
      await assert.rejects(s.finish(run, f.receipt), { status: 409 });
    });
  });
  for (const mode of ["pending", "global", "swallow", "lost-response"] as const) {
    await scenario(async (f, s, run) => {
      const commit = p.db.commitTransaction;
      try {
        if (mode === "pending" || mode === "global")
          await p.db.pool.query(`ALTER TABLE audit_events ADD CONSTRAINT control_probe CHECK
            (NOT(entity='exhibition-reminder-scheduler' AND action='${mode === "pending" ? "pending-v1" : "state-v1"}')) NOT VALID`);
        else
          p.db.commitTransaction = async (id) => {
            if (mode === "swallow") await p.db.rollbackTransaction(id);
            else {
              await commit.call(p.db, id);
              throw Error("Lost commit response");
            }
          };
        await assert.rejects(s.prepare(run, f.receipt));
      } finally {
        p.db.commitTransaction = commit;
        await p.db.pool.query("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS control_probe");
      }
      const blocked = mode === "lost-response";
      assert.equal(
        (await readExhibitionSchedulerStatus(p, f.admin.headers)).status,
        blocked ? "blocked" : "running",
      );
      const associations = await p.db.pool.query(
        "SELECT id FROM audit_events WHERE entity='exhibition-reminder-scheduler' AND action='pending-v1'",
      );
      assert.equal(associations.rowCount, blocked ? 1 : 0);
      await assert.rejects(s.begin([f.scope]), { status: 409 });
    });
  }
  for (const mode of ["normal", "constraint", "swallow", "lost-response"] as const) {
    await scenario(async (f, s, run) => {
      await s.prepare(run, f.receipt);
      const report = await s.apply(run, f.receipt);
      assert.equal(report.counts.create, 1);
      const commit = p.db.commitTransaction;
      try {
        if (mode === "constraint")
          await p.db.pool.query(
            "ALTER TABLE audit_events ADD CONSTRAINT control_probe CHECK (entity<>'exhibition-reminder-scheduler') NOT VALID",
          );
        if (mode === "swallow" || mode === "lost-response")
          p.db.commitTransaction = async (id) => {
            if (mode === "swallow") await p.db.rollbackTransaction(id);
            else {
              await commit.call(p.db, id);
              throw Error("Lost finish response");
            }
          };
        if (mode === "normal") await s.finish(run, f.receipt);
        else await assert.rejects(s.finish(run, f.receipt));
      } finally {
        p.db.commitTransaction = commit;
        await p.db.pool.query("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS control_probe");
      }
      const status = await readExhibitionSchedulerStatus(p, f.other.headers);
      assert.equal(
        status.status,
        mode === "normal" || mode === "lost-response" ? "running" : "blocked",
      );
      if (mode === "normal") await s.stop(run);
      else await assert.rejects(s.stop(run), { status: 409 });
    });
  }
}
