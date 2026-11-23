import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ChildProcess } from "node:child_process";
import type pg from "pg";

export async function waitForWorkerCondition(
  check: () => Promise<boolean>,
  label: string,
  child?: ChildProcess,
  timeout = 30000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    assert.ok(
      !child || (child.exitCode === null && child.signalCode === null),
      `${label}: worker exited early`,
    );
    await delay(25);
  }
  assert.fail(`${label}: timed out`);
}

export async function waitForWorkerSessionsGone(db: pg.Client, applicationName: string) {
  await waitForWorkerCondition(
    async () =>
      !(
        await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1",
          [applicationName],
        )
      ).rowCount,
    "worker database sessions must finish rollback",
    undefined,
    10000,
  );
}

export async function createWorkerResultBarrier(db: pg.Client, slotId: number) {
  const { rows } = await db.query<{ database: string; pid: number }>(
    "SELECT current_database() AS database, pg_backend_pid() AS pid",
  );
  assert.match(rows[0].database, /^hua_subscriptions_[a-f0-9]{32}$/);
  assert.ok(Number.isSafeInteger(slotId) && slotId > 0);
  const tag = randomUUID();
  const name = "worker_result_" + tag.replaceAll("-", "");
  const key = "worker-result:" + tag;
  let released = false,
    closed = false;
  await db.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [key]);
  const release = async () => {
    if (released) return;
    const result = await db.query<{ released: boolean }>(
      "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS released",
      [key],
    );
    assert.equal(result.rows[0].released, true);
    released = true;
  };
  try {
    // The identifier, lock literal and slot are generated/validated fixture values, never user SQL.
    await db.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='outcome-mock-attempt' AND NEW.after->>'slotId'='${slotId}' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0));
      END IF; RETURN NEW; END $$;
      CREATE TRIGGER ${name} BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION ${name}();`);
  } catch (error) {
    await release();
    throw error;
  }
  return {
    release,
    async waitForBlocked(applicationName: string, child: ChildProcess) {
      let pid = 0;
      await waitForWorkerCondition(
        async () => {
          const blocked = await db.query<{ pid: number }>(
            `SELECT pid FROM pg_stat_activity
          WHERE datname=current_database() AND application_name=$1
          AND wait_event='advisory' AND $2=ANY(pg_blocking_pids(pid))`,
            [applicationName, rows[0].pid],
          );
          assert.ok(blocked.rows.length <= 1, "only this worker result may wait on the barrier");
          pid = blocked.rows[0]?.pid ?? 0;
          return pid > 0;
        },
        "result transaction must reach slot barrier",
        child,
      );
      return pid;
    },
    async close() {
      if (closed) return;
      await release();
      await db.query(`DROP TRIGGER ${name} ON audit_events; DROP FUNCTION ${name}()`);
      closed = true;
    },
  };
}
