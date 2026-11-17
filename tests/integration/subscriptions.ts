import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { getPayload, handleEndpoints, type Where } from "payload";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261117_120000_subscription_data";
import { confirmSubscription, startSubscription } from "../../src/server/subscriptions";
import { databaseFingerprints } from "../helpers/database-fingerprints";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(process.env.HUA_DEMO_SCHEMA_PUSH, "false");
assert.equal(url.protocol, "postgresql:");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(!url.search && !url.hash, "Database URL must not override connection settings");
assert.ok(
  (url.port === "55442" &&
    url.username === "hua_demo" &&
    /^\/hua_subscriptions_[a-f0-9]{32}$/.test(url.pathname)) ||
    (process.env.GITHUB_ACTIONS === "true" &&
      url.port === "55438" &&
      url.username === "hua" &&
      url.pathname === "/hua_companion"),
  "Subscriptions require an isolated test database",
);
const payload = await getPayload({ config });
const email = `subscription-${randomUUID()}@example.invalid`;
const input = {
  email: ` ${email.toUpperCase()} `,
  topic: "policy-updates",
  locale: "en",
  privacyVersion: "fictional-v1",
  sourcePath: "/en/tools/visa-checker",
  partnerCode: "fictional-partner",
};
const subscriptionScope = { email: { equals: email } };
const find = (where: Where = subscriptionScope) =>
  payload.find({ collection: "subscriptions", where, depth: 0, limit: 10 });
const credentialFor = async (token: string) => {
  const tokenHash = createHash("sha256")
    .update("subscription:confirm:")
    .update(token)
    .digest("hex");
  const { docs } = await payload.find({
    collection: "subscription-credentials",
    where: { tokenHash: { equals: tokenHash } },
    limit: 1,
    depth: 0,
  });
  assert.equal(docs.length, 1);
  return docs[0];
};

async function checkMigration(run: (db: pg.Client) => Promise<void>) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query("BEGIN");
    await run(db);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
}
const adapter = (db: pg.Client) => ({
  db: { execute: (statement: string) => db.query(statement) },
});
try {
  await checkMigration(async (db) => {
    const before = await databaseFingerprints(db);
    await down(adapter(db) as unknown as MigrateDownArgs);
    const former = await databaseFingerprints(db);
    assert.equal(former.length, before.length - 2);
    assert.deepEqual(
      former,
      before.filter(
        ({ table }) => table !== "subscriptions" && table !== "subscription_credentials",
      ),
    );
    await up(adapter(db) as unknown as MigrateUpArgs);
    assert.deepEqual(await databaseFingerprints(db), before);
  });
  console.log("PASS 空表回退及重迁移，既有表指纹一致");

  await assert.rejects(startSubscription(payload, { ...input, topic: "exhibition:" }));
  await assert.rejects(startSubscription(payload, { ...input, privacyVersion: " " }));
  await assert.rejects(startSubscription(payload, { ...input, sourcePath: "/en/visa?country=XY" }));
  const startedAt = Date.now();
  const first = await startSubscription(payload, input);
  assert.ok(first);
  assert.match(first, /^[0-9a-f]{64}$/);
  const initial = (await find()).docs[0];
  assert.equal(initial.email, email);
  assert.equal(initial.status, "pending");
  assert.ok(!initial.confirmedAt);
  assert.ok(initial.consentedAt);
  for (const key of ["topic", "locale", "privacyVersion", "sourcePath", "partnerCode"] as const)
    assert.equal(initial[key], input[key]);
  const active = () => find({ and: [subscriptionScope, { status: { equals: "confirmed" } }] });
  assert.equal((await active()).totalDocs, 0);

  const grant = await credentialFor(first);
  assert.equal(grant.version, initial.consentVersion);
  assert.equal(grant.subscription, initial.id);
  assert.ok(Date.parse(initial.consentedAt) >= startedAt);
  assert.equal(Date.parse(grant.expiresAt) - Date.parse(initial.consentedAt), 24 * 60 * 60 * 1000);
  assert.ok(!JSON.stringify(grant).includes(first));
  await assert.rejects(
    checkMigration((db) => down(adapter(db) as unknown as MigrateDownArgs)),
    /Preserve subscription records before rollback/,
  );
  assert.equal((await find()).totalDocs, 1);
  for (const path of [
    "/api/subscriptions",
    `/api/subscriptions/${initial.id}`,
    "/api/subscription-credentials",
    `/api/subscription-credentials/${grant.id}`,
  ]) {
    const response = await handleEndpoints({
      config,
      request: new Request("http://127.0.0.1:3000" + path),
    });
    assert.equal(response.status, 501, path);
    const body = await response.text();
    assert.ok(!body.includes(email) && !body.includes(grant.tokenHash));
  }
  await assert.rejects(
    payload.find({ collection: "subscriptions", overrideAccess: false, depth: 0 }),
    { status: 403 },
  );
  await assert.rejects(
    payload.findByID({
      collection: "subscription-credentials",
      id: grant.id,
      overrideAccess: false,
      depth: 0,
    }),
    { status: 403 },
  );

  await payload.update({
    collection: "subscription-credentials",
    id: grant.id,
    data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
  });
  assert.equal(await confirmSubscription(payload, first), false);
  assert.equal((await active()).totalDocs, 0);

  const previous = await startSubscription(payload, input);
  const current = await startSubscription(payload, { ...input, privacyVersion: "fictional-v2" });
  assert.ok(previous && current && previous !== current);
  assert.equal((await find()).totalDocs, 1);
  assert.equal(await confirmSubscription(payload, previous), false);
  const live = await credentialFor(current);
  await payload.update({
    collection: "subscription-credentials",
    id: live.id,
    data: { purpose: "unsubscribe" },
  });
  assert.equal(await confirmSubscription(payload, current), false);
  await payload.update({
    collection: "subscription-credentials",
    id: live.id,
    data: { purpose: "confirm" },
  });
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () => confirmSubscription(payload, current)),
  );
  assert.equal(attempts.filter(Boolean).length, 1);
  const verified = (await active()).docs[0];
  assert.equal(verified.privacyVersion, "fictional-v2");
  assert.ok(verified.confirmedAt);
  assert.ok((await credentialFor(current)).consumedAt);
  assert.equal(await confirmSubscription(payload, current), false);
  assert.equal(await startSubscription(payload, input), null);
  assert.equal((await active()).docs[0].confirmedAt, verified.confirmedAt);

  const expo = { ...input, topic: "exhibition:fictional-expo" };
  const [firstExpo, laterExpo] = await Promise.all([
    startSubscription(payload, expo),
    startSubscription(payload, expo),
  ]);
  assert.ok(firstExpo && laterExpo && firstExpo !== laterExpo);
  const expoGrants = await Promise.all([credentialFor(firstExpo), credentialFor(laterExpo)]);
  assert.deepEqual(expoGrants.map(({ version }) => version).sort(), [1, 2]);
  assert.equal((await find()).totalDocs, 2);
  assert.equal((await active()).totalDocs, 1);
  console.log("PASS 订阅待确认、24 小时凭证、过期、旧版本、跨用途、并发单次使用和匿名读取拒绝");
} finally {
  const own = (await find()).docs;
  for (const subscription of own) {
    await payload.delete({
      collection: "subscription-credentials",
      where: { subscription: { equals: subscription.id } },
    });
    await payload.delete({ collection: "subscriptions", id: subscription.id });
  }
  await payload.destroy();
}
process.exit(0);
