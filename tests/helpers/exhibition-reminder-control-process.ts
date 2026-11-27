import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { withExhibitionScheduler } from "../../src/server/exhibition-reminder-scheduler-control";
import { assertRecoveryDatabase } from "./exhibition-reminder-recovery-fixture";
assertRecoveryDatabase();
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  throw Error("No outbound");
};
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8"));
const c = await config;
const db = {
  ...c.db,
  init: (a: Parameters<typeof c.db.init>[0]) =>
    Object.assign(c.db.init(a), { push: false, disableCreateDatabase: true }),
};
const p = await getPayload({
  config: Object.assign({}, c, {
    db,
    telemetry: false,
    logger: { options: { level: "silent" } },
    typescript: { ...c.typescript, autoGenerate: false },
  }),
});
const wait = () => new Promise<void>((resolve) => process.once("message", () => resolve()));
const headers = new Headers({ authorization: fixture.authorization });
// Test-only stale transport notifications: the actual lock connection still dies.
// Leave its local checks stale so the DB-state fence must reject the old write.
if (fixture.mode === "resolve-first") {
  const connect = p.db.pool.connect.bind(p.db.pool);
  let wrapped = false;
  p.db.pool.connect = ((callback?: unknown) => {
    if (typeof callback === "function") return (connect as (cb: unknown) => unknown)(callback);
    return connect().then((client) => {
      if (wrapped) return client;
      wrapped = true;
      const query = client.query.bind(client),
        on = client.on.bind(client);
      let registrations = 0;
      client.on = ((
        event: Parameters<typeof client.on>[0],
        listener: (...args: unknown[]) => void,
      ) => {
        if (["error", "end"].includes(event) && registrations < 2) {
          registrations++;
          if (registrations === 2) client.on = on;
          return on(event, () => {});
        }
        return on(event, listener);
      }) as typeof client.on;
      client.query = ((...args: unknown[]) =>
        args[0] === "SELECT 1"
          ? Promise.resolve({ rows: [{ value: 1 }] })
          : (query as (...a: unknown[]) => unknown)(...args)) as typeof client.query;
      return client;
    });
  }) as typeof p.db.pool.connect;
}

try {
  if (fixture.mode === "lock") {
    await assert.rejects(
      withExhibitionScheduler(p, headers, async () => {}),
      { status: 409 },
    );
    process.send?.({ phase: "refused" });
  } else
    await withExhibitionScheduler(p, headers, async (s) => {
      const { runId } = await s.begin([fixture.scope]);
      const { revision } = await s.prepare(runId, fixture.receipt);
      const locks = await p.db.pool.query(
        "SELECT pid FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND objid=726291 AND granted",
      );
      assert.equal(locks.rowCount, 1);
      process.send?.({ phase: "prepared", revision, lockPid: locks.rows[0].pid });
      await wait();
      if (fixture.mode === "resolve-first") {
        // Deliberately omit the local liveness check to prove the DB fencing itself.
        await assert.rejects(s.apply(runId, fixture.receipt), {
          status: 409,
        });
        process.send?.({ phase: "rejected" });
      } else {
        const commit = p.db.commitTransaction;
        p.db.commitTransaction = async (id) => {
          process.send?.({ phase: "write-locked" });
          await wait();
          await commit.call(p.db, id);
        };
        const r = await s.apply(runId, fixture.receipt);
        assert.equal(r.counts.create, 1);
        process.send?.({ phase: "committed" });
      }
    });
  assert.equal(calls, 0);
} finally {
  await p.destroy();
}
process.exit(0);
