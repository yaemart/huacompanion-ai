import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { inspectExhibitionReminder } from "../../src/server/exhibition-reminder-history";
import { assertRecoveryDatabase } from "./exhibition-reminder-recovery-fixture";
import { databaseFingerprints } from "./database-fingerprints";
assertRecoveryDatabase();
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
  email: string;
  password: string;
  receipt: string;
  uncommitted: string;
  asOf: string;
};
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
try {
  const { token } = await p.login({
    collection: "staff",
    data: { email: fixture.email, password: fixture.password },
  });
  assert.ok(token);
  const headers = new Headers({ authorization: "JWT " + token });
  const before = await databaseFingerprints(p.db.pool);
  const r = await inspectExhibitionReminder(p, headers, fixture.receipt);
  assert.equal(r.state, "committed");
  if (r.state !== "committed") throw Error("Missing historical report");
  assert.equal(r.report.asOf, fixture.asOf);
  assert.equal(r.report.currentEligibility, "not-checked");
  assert.equal(
    (await inspectExhibitionReminder(p, headers, fixture.uncommitted)).state,
    "not-found",
  );
  assert.deepEqual(await databaseFingerprints(p.db.pool), before);
  console.log(
    "PASS fresh readonly history: new key/session, old day and expired seal, master off, uncommitted remains uncommitted",
  );
} finally {
  await p.destroy();
}
process.exit(0);
