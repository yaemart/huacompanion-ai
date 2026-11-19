import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { getPayload, handleEndpoints, type Where } from "payload";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261117_120000_subscription_data";
import {
  up as upMailQueue,
  down as downMailQueue,
} from "../../src/migrations/20261117_210000_subscription_mail_queue";
import { confirmSubscription, startSubscription } from "../../src/server/subscriptions";
import { GET, POST } from "../../src/app/(frontend)/email-subscription/route";
import { subscriptionActionURL } from "../../src/lib/subscription-action";
import {
  up as upDelivery,
  down as downDelivery,
} from "../../src/migrations/20261118_090000_subscription_delivery";
import { testSubscriptionDelivery } from "./subscription-delivery";
import { testSubscriptionForm } from "./subscription-form";
import { testPolicyEmail } from "./policy-email";
import { testSubscriptionManagement } from "./subscription-management";
import { testSubscriptionCsv } from "./subscription-csv";
import { testSubscriptionJourney } from "./subscription-journey";
import { testSubscriptionCampaignGrants } from "./subscription-campaign-grants";
import { testCampaignAccess } from "./subscription-campaign-access";
import { testCampaignDraftSchema } from "./subscription-campaign-drafts";
import { testCampaignPreview } from "./subscription-campaign-preview";
import { testCampaignPages } from "./subscription-campaign-pages";
import {
  up as upPolicyMail,
  down as downPolicyMail,
} from "../../src/migrations/20261118_130000_policy_subscription_mail";
import { testSubscriptionSubmission } from "./subscription-submission";
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
      /^\/hua_subscriptions_[a-f0-9]{32}$/.test(url.pathname)),
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
const credentialFor = async (token: string, purpose = "confirm") => {
  const tokenHash = createHash("sha256")
    .update(`subscription:${purpose}:`)
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
    await downPolicyMail(adapter(db) as unknown as MigrateDownArgs);
    await downDelivery(adapter(db) as unknown as MigrateDownArgs);
    await downMailQueue(adapter(db) as unknown as MigrateDownArgs);
    await down(adapter(db) as unknown as MigrateDownArgs);
    const former = await databaseFingerprints(db);
    assert.equal(former.length, before.length - 3);
    assert.deepEqual(
      former,
      before.filter(
        ({ table }) =>
          !["subscriptions", "subscription_credentials", "subscription_mail_jobs"].includes(table),
      ),
    );
    await up(adapter(db) as unknown as MigrateUpArgs);
    await upMailQueue(adapter(db) as unknown as MigrateUpArgs);
    await upDelivery(adapter(db) as unknown as MigrateUpArgs);
    await upPolicyMail(adapter(db) as unknown as MigrateUpArgs);
    assert.deepEqual(await databaseFingerprints(db), before);
  });
  console.log("PASS 空表回退及重迁移，既有表指纹一致");

  await assert.rejects(startSubscription(payload, { ...input, topic: "exhibition:" }));
  await assert.rejects(startSubscription(payload, { ...input, privacyVersion: " " }));
  await assert.rejects(startSubscription(payload, { ...input, sourcePath: "/en/visa?country=XY" }));
  const startedAt = Date.now();
  const first = await startSubscription(payload, input);
  assert.ok(first);
  assert.match(first.confirm, /^[0-9a-f]{64}$/);
  const initial = (await find()).docs[0];
  assert.equal(initial.email, email);
  assert.equal(initial.status, "pending");
  assert.ok(!initial.confirmedAt);
  assert.ok(initial.consentedAt);
  for (const key of ["topic", "locale", "privacyVersion", "sourcePath", "partnerCode"] as const)
    assert.equal(initial[key], input[key]);
  const active = () => find({ and: [subscriptionScope, { status: { equals: "confirmed" } }] });
  assert.equal((await active()).totalDocs, 0);

  const grant = await credentialFor(first.confirm);
  assert.equal(grant.version, initial.consentVersion);
  assert.equal(grant.subscription, initial.id);
  assert.ok(Date.parse(initial.consentedAt) >= startedAt);
  assert.equal(Date.parse(grant.expiresAt) - Date.parse(initial.consentedAt), 24 * 60 * 60 * 1000);
  assert.ok(!JSON.stringify(grant).includes(first.confirm));
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
  assert.equal(await confirmSubscription(payload, first.confirm), false);
  assert.equal((await active()).totalDocs, 0);

  const previous = await startSubscription(payload, input);
  const current = await startSubscription(payload, { ...input, privacyVersion: "fictional-v2" });
  assert.ok(previous && current && previous.confirm !== current.confirm);
  assert.equal((await find()).totalDocs, 1);
  assert.equal(await confirmSubscription(payload, previous.confirm), false);
  const live = await credentialFor(current.confirm);
  await payload.update({
    collection: "subscription-credentials",
    id: live.id,
    data: { purpose: "unsubscribe" },
  });
  assert.equal(await confirmSubscription(payload, current.confirm), false);
  await payload.update({
    collection: "subscription-credentials",
    id: live.id,
    data: { purpose: "confirm" },
  });
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () => confirmSubscription(payload, current.confirm)),
  );
  assert.equal(attempts.filter(Boolean).length, 1);
  const verified = (await active()).docs[0];
  assert.equal(verified.privacyVersion, "fictional-v2");
  assert.ok(verified.confirmedAt);
  assert.ok((await credentialFor(current.confirm)).consumedAt);
  assert.equal(await confirmSubscription(payload, current.confirm), false);
  assert.equal(await startSubscription(payload, input), null);
  assert.equal((await active()).docs[0].confirmedAt, verified.confirmedAt);

  const expo = { ...input, topic: "exhibition:fictional-expo" };
  const [firstExpo, laterExpo] = await Promise.all([
    startSubscription(payload, expo),
    startSubscription(payload, expo),
  ]);
  assert.ok(firstExpo && laterExpo && firstExpo.confirm !== laterExpo.confirm);
  const expoGrants = await Promise.all([
    credentialFor(firstExpo.confirm),
    credentialFor(laterExpo.confirm),
  ]);
  assert.deepEqual(expoGrants.map(({ version }) => version).sort(), [1, 2]);
  assert.equal((await find()).totalDocs, 2);
  assert.equal((await active()).totalDocs, 1);
  console.log("PASS 订阅待确认、24 小时凭证、过期、旧版本、跨用途、并发单次使用和匿名读取拒绝");

  // Fake mailbox captures the same links as a later transactional adapter.
  const origin = new URL(process.env.APP_URL!).origin;
  process.env.APP_URL = `${origin}/`;
  const optOutInput = { ...input, topic: "sourcing-guides", locale: "zh" };
  const pending = await startSubscription(payload, optOutInput);
  assert.ok(pending);
  const cancelURL = subscriptionActionURL(origin, "unsubscribe", "zh", pending.unsubscribe);
  const confirmURL = subscriptionActionURL(origin, "confirm", "zh", pending.confirm);
  for (const link of [cancelURL, confirmURL]) {
    assert.ok(link.hash.startsWith("#token="));
    assert.ok(!link.search.includes(link.hash.slice(7)));
  }
  const request = (link: URL, token: string, requestOrigin = origin) =>
    new Request(link.href, {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  const getRecord = async (topic = optOutInput.topic) =>
    (await find({ and: [subscriptionScope, { topic: { equals: topic } }] })).docs[0];
  process.env.SUBSCRIPTIONS_ENABLED = "false";
  assert.equal(GET(new Request(confirmURL.href)).status, 404);
  assert.equal((await POST(request(cancelURL, pending.unsubscribe))).status, 404);
  assert.equal((await getRecord()).status, "pending");
  process.env.SUBSCRIPTIONS_ENABLED = "true";
  const page = GET(new Request(confirmURL.href));
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control") || "", /no-store/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  const html = await page.text();
  assert.ok(!html.includes(pending.confirm) && !html.includes(email));
  assert.match(html, /确认订阅/);
  assert.equal(GET(new Request(cancelURL.href)).status, 200);
  assert.equal((await getRecord()).status, "pending");
  assert.equal(
    (await POST(request(cancelURL, pending.unsubscribe, "https://other.invalid"))).status,
    403,
  );
  assert.equal(
    (
      await POST(
        new Request(confirmURL.href, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ token: pending.confirm, padding: "a".repeat(256) }),
        }),
      )
    ).status,
    413,
  );
  assert.equal((await POST(request(confirmURL, pending.unsubscribe))).status, 400);
  assert.equal((await POST(request(cancelURL, pending.unsubscribe))).status, 200);
  assert.equal((await getRecord()).status, "unsubscribed");
  assert.equal((await POST(request(confirmURL, pending.confirm))).status, 400);

  const superseded = await startSubscription(payload, optOutInput);
  const newConsent = await startSubscription(payload, optOutInput);
  assert.ok(superseded && newConsent);
  assert.equal((await POST(request(cancelURL, pending.unsubscribe))).status, 400);
  assert.equal((await POST(request(confirmURL, newConsent.confirm))).status, 200);
  const confirmed = await getRecord();
  assert.equal(confirmed.status, "confirmed");
  const staleOptOut = await credentialFor(superseded.unsubscribe, "unsubscribe");
  assert.ok(!staleOptOut.consumedAt);
  assert.equal((await POST(request(cancelURL, superseded.unsubscribe))).status, 400);
  assert.equal((await getRecord()).status, "confirmed");
  const validOptOut = await credentialFor(newConsent.unsubscribe, "unsubscribe");
  assert.equal(
    Date.parse(validOptOut.expiresAt) - Date.parse(confirmed.consentedAt),
    365 * 24 * 60 * 60 * 1000,
  );
  await payload.update({
    collection: "subscription-credentials",
    id: validOptOut.id,
    data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
  });
  assert.equal((await POST(request(cancelURL, newConsent.unsubscribe))).status, 400);
  await payload.update({
    collection: "subscription-credentials",
    id: validOptOut.id,
    data: { expiresAt: validOptOut.expiresAt },
  });
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () => POST(request(cancelURL, newConsent.unsubscribe))),
  );
  assert.equal(outcomes.filter(({ status }) => status === 200).length, 1);
  const stopped = await getRecord();
  assert.equal(stopped.status, "unsubscribed");
  assert.ok(stopped.unsubscribedAt && stopped.confirmedAt);
  const finalConsent = await startSubscription(payload, optOutInput);
  assert.ok(finalConsent);
  assert.equal((await POST(request(confirmURL, finalConsent.confirm))).status, 200);
  assert.equal((await POST(request(cancelURL, newConsent.unsubscribe))).status, 400);
  assert.equal((await getRecord()).status, "confirmed");

  const raceInput = { ...input, topic: "exhibition-alerts" };
  const racing = await startSubscription(payload, raceInput);
  assert.ok(racing);
  const [confirmRace, cancelRace] = await Promise.all([
    POST(request(confirmURL, racing.confirm)),
    POST(request(cancelURL, racing.unsubscribe)),
  ]);
  assert.ok([200, 400].includes(confirmRace.status));
  assert.equal(cancelRace.status, 200);
  assert.equal((await getRecord(raceInput.topic)).status, "unsubscribed");
  console.log("PASS 免登录确认、只读预取、退订、再订阅及旧凭证拒绝");
  await checkMigration(async (db) => {
    const before = await databaseFingerprints(db);
    await downPolicyMail(adapter(db) as unknown as MigrateDownArgs);
    await downDelivery(adapter(db) as unknown as MigrateDownArgs);
    await downMailQueue(adapter(db) as unknown as MigrateDownArgs);
    await upMailQueue(adapter(db) as unknown as MigrateUpArgs);
    await upDelivery(adapter(db) as unknown as MigrateUpArgs);
    await upPolicyMail(adapter(db) as unknown as MigrateUpArgs);
    assert.deepEqual(await databaseFingerprints(db), before);
  });
  await testSubscriptionSubmission(payload, url);
  await testSubscriptionDelivery(payload, url);
  await testSubscriptionForm(payload);
  await testPolicyEmail(payload, url);
  await testSubscriptionManagement(payload);
  await testSubscriptionCsv(payload, url);
  await testSubscriptionJourney(payload);
  await testSubscriptionCampaignGrants(payload, url);
  await testCampaignAccess(payload, url);
  await testCampaignDraftSchema(payload, url);
  await testCampaignPreview(payload, url);
  await testCampaignPages(payload);
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
