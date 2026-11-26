import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { applyExhibitionReminders } from "../../src/server/exhibition-reminders";
import { databaseFingerprints } from "./database-fingerprints";

assert.equal(process.env.APP_ENV, "local");
assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
const fixture = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
  email: string;
  password: string;
  receipt: string;
  uncommitted: string;
  asOf: string;
};
const p = await getPayload({ config });
try {
  const { token } = await p.login({
    collection: "staff",
    data: { email: fixture.email, password: fixture.password },
  });
  const headers = new Headers({ authorization: "JWT " + token });
  const before = await databaseFingerprints(p.db.pool);
  const replay = await applyExhibitionReminders(p, headers, fixture.receipt);
  assert.equal(replay.replayed, true);
  assert.equal(replay.currentEligibility, "not-checked");
  assert.equal(replay.asOf, fixture.asOf);
  await assert.rejects(applyExhibitionReminders(p, headers, fixture.uncommitted), { status: 409 });
  assert.deepEqual(await databaseFingerprints(p.db.pool), before);
  console.log(
    "PASS reminder history in fresh process: rotated key, new authenticated session, master off and different day; no writes",
  );
} finally {
  await p.destroy();
}
process.exit(0);
