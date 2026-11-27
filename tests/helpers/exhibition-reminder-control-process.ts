import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { withExhibitionScheduler } from "../../src/server/exhibition-reminder-scheduler-control";
import { applyExhibitionReminders } from "../../src/server/exhibition-reminders";
import { schedulerPermit } from "../../src/server/exhibition-reminder-scheduler-guard";
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
      process.send?.({ phase: "prepared", revision });
      await wait();
      if (fixture.mode === "resolve-first") {
        // Deliberately omit the local liveness check to prove the DB fencing itself.
        const stale = schedulerPermit(p, runId, async () => {});
        await assert.rejects(applyExhibitionReminders(p, headers, fixture.receipt, stale), {
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
