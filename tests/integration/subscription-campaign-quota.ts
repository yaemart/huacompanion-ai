import {
  up as upSignedFeedback,
  down as downSignedFeedback,
} from "../../src/migrations/20261126_090000_subscription_signed_feedback";
import {
  up as upFeedback,
  down as downFeedback,
} from "../../src/migrations/20261125_120000_subscription_campaign_feedback";
import {
  up as upAttempts,
  down as downAttempts,
} from "../../src/migrations/20261121_213000_subscription_campaign_mock_attempts";
import {
  up as upLeases,
  down as downLeases,
} from "../../src/migrations/20261121_130000_subscription_campaign_mock_leases";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { recheckCampaignRecipients } from "../../src/server/subscription-campaign-recheck";
import { up, down } from "../../src/migrations/20261121_090000_subscription_campaign_mock_quota";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignQuota(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  await db.connect();
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构额度测试",
          email: `${people.length}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(user.id);
      return user;
    };
    const admin = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    const editor = await person("editor");
    const reviewer = await person("reviewer");
    for (const user of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager);
    const policies = [
      workspace.choices.find((row) => row.policies.zh && row.policies.en)!.policies,
    ];
    const prepare = async (input: { campaignKey: string; revision: number }) => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    const fresh = async () => {
      const row = await saveCampaignDraft(p, manager, { policies });
      const input = { campaignKey: row.campaignKey, revision: row.revision };
      await prepare(input);
      const batch = await freezeCampaignRecipients(p, manager, input);
      return { input, batch };
    };
    for (const [name, locale, domain] of [
      ["a", "zh", "example.invalid"],
      ["b", "en", "example.invalid"],
      ["outside", "en", "example.com"],
    ] as const)
      await p.create({
        collection: "subscriptions",
        data: {
          email: `${name}-${key}@${domain}`,
          topic: "policy-updates",
          locale,
          status: "confirmed",
          consentVersion: 1,
          consentedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          privacyVersion: key,
          sourcePath: "/en",
        },
      });
    const { input } = await fresh();
    const requestKey = randomUUID();
    const reserve = (request: string = requestKey) =>
      reserveMockCampaignSlot(p, manager, { ...input, key: request });
    const budget = (remaining: number) =>
      setMockCampaignBudget(p, admin, { remaining, reason: "虚构本机余额，非真实账户" });
    const count = async () =>
      (await p.count({ collection: "subscription-campaign-mock-slots" })).totalDocs;
    const mailBefore = (await databaseFingerprints(db)).find(
      (row) => row.table === "subscription_mail_jobs",
    );
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await downSignedFeedback(adapter as unknown as MigrateDownArgs);
      await downFeedback(adapter as unknown as MigrateDownArgs);
      await downAttempts(adapter as unknown as MigrateDownArgs);
      await downLeases(adapter as unknown as MigrateDownArgs);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      await upLeases(adapter as unknown as MigrateUpArgs);
      await upAttempts(adapter as unknown as MigrateUpArgs);
      await upFeedback(adapter as unknown as MigrateUpArgs);
      await upSignedFeedback(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const collection of [
      "subscription-campaign-mock-budgets",
      "subscription-campaign-mock-slots",
    ] as const)
      for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
        await assert.rejects(p.find({ collection, user, overrideAccess: false }), { status: 403 });
        await assert.rejects(
          p.create({ collection, user, overrideAccess: false, data: {} as never }),
          { status: 403 },
        );
      }
    for (const user of [
      undefined,
      manager,
      operations,
      editor,
      reviewer,
      { ...operations, role: "admin" },
    ])
      await assert.rejects(setMockCampaignBudget(p, user, { remaining: 2, reason: "虚构" }), {
        status: 403,
      });
    for (const data of [
      { remaining: -1, reason: "x" },
      { remaining: 2001, reason: "x" },
      { remaining: 1.2, reason: "x" },
      { remaining: "2", reason: "x" },
      { remaining: 2, reason: " " },
      { remaining: 2, reason: "x", expiresAt: "2099-01-01" },
    ])
      await assert.rejects(setMockCampaignBudget(p, admin, data), { status: 400 });
    for (const user of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ])
      await assert.rejects(reserveMockCampaignSlot(p, user, { ...input, key: requestKey }), {
        status: 403,
      });
    await assert.rejects(reserveMockCampaignSlot(p, other, { ...input, key: requestKey }), {
      status: 404,
    });
    for (const data of [
      { ...input, key: "bad" },
      { ...input, key: requestKey, remaining: 2000 },
      { ...input, key: requestKey, email: "injected@example.invalid" },
    ])
      await assert.rejects(reserveMockCampaignSlot(p, manager, data), { status: 400 });
    assert.equal((await reserve()).state, "budget-unavailable");
    assert.equal(await count(), 0);
    await budget(0);
    assert.equal((await reserve()).state, "budget-exhausted");
    assert.equal(await count(), 0);
    const expired = await budget(2);
    await p.update({
      collection: "subscription-campaign-mock-budgets",
      id: expired.id,
      data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    assert.equal((await reserve()).state, "budget-unavailable");
    const liveBudget = await budget(2);
    await db.query(`CREATE FUNCTION reject_mock_quota_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('set-mock-budget','reserve-mock-slot') THEN RAISE EXCEPTION 'reject quota audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_mock_quota_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_mock_quota_commit();`);
    const budgets = (await p.count({ collection: "subscription-campaign-mock-budgets" })).totalDocs;
    try {
      await assert.rejects(budget(1), { status: 503 });
      assert.equal(
        (await p.count({ collection: "subscription-campaign-mock-budgets" })).totalDocs,
        budgets,
      );
      await assert.rejects(reserve(), { status: 503 });
      assert.equal(await count(), 0);
    } finally {
      await db.query(
        "DROP TRIGGER reject_mock_quota_commit ON audit_events; DROP FUNCTION reject_mock_quota_commit()",
      );
    }
    const otherKey = randomUUID();
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) => reserve(i % 2 === 0 ? requestKey : otherKey)),
    );
    assert.equal(attempts.filter((row) => row.state === "reserved-local").length, 2);
    assert.equal(await count(), 2);
    const slots = await p.find({
      collection: "subscription-campaign-mock-slots",
      depth: 0,
      pagination: false,
    });
    assert.equal(new Set(slots.docs.map((row) => row.job)).size, 2);
    const first = slots.docs.find((row) => row.key === requestKey)!;
    assert.ok(first);
    assert.deepEqual(await reserve(), { state: "already-reserved", id: first.id });
    assert.deepEqual(await reserve(requestKey.toUpperCase()), {
      state: "already-reserved",
      id: first.id,
    });
    assert.equal(await count(), 2);
    assert.doesNotMatch(
      JSON.stringify(attempts),
      /@|email|recipient|job|subscription|API_KEY|token/,
    );
    for (const collection of [
      "subscription-campaign-mock-budgets",
      "subscription-campaign-mock-slots",
    ] as const) {
      const id = collection === "subscription-campaign-mock-budgets" ? liveBudget.id : first.id;
      for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
        const scope = { collection, id, user, overrideAccess: false };
        await assert.rejects(p.findByID(scope), { status: 403 });
        await assert.rejects(p.update({ ...scope, data: {} }), { status: 403 });
        await assert.rejects(p.delete(scope), { status: 403 });
      }
    }
    await budget(10);
    assert.equal(
      (await reserve(randomUUID())).state,
      "no-candidate",
      "outside-domain subscriber must not get a mock slot",
    );
    const otherBatch = await fresh();
    await assert.rejects(
      reserveMockCampaignSlot(p, manager, { ...otherBatch.input, key: requestKey }),
      { status: 409 },
    );
    const reserveOther = () =>
      reserveMockCampaignSlot(p, manager, { ...otherBatch.input, key: randomUUID() });
    assert.equal((await reserveOther()).state, "email-limit");
    await db.query(
      `UPDATE subscription_campaign_mock_slots SET reserved_at=(date_trunc('day',statement_timestamp() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')-interval '1 millisecond'`,
    );
    assert.equal(
      (await reserveOther()).state,
      "email-limit",
      "new Beijing date must not reset rolling email cap",
    );
    await db.query(
      "UPDATE subscription_campaign_mock_slots SET reserved_at=statement_timestamp()-interval '24 hours 1 millisecond' WHERE id=$1",
      [first.id],
    );
    assert.equal((await reserveOther()).state, "reserved-local");
    const originalJob = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: first.job as number,
      depth: 0,
    });
    await p.update({
      collection: "subscriptions",
      id: originalJob.subscription as number,
      data: { status: "unsubscribed" },
    });
    await recheckCampaignRecipients(p, manager, input);
    assert.equal((await reserve()).state, "ineligible");
    assert.equal(await count(), 3, "cancellation must not refund occupied slots");
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve mock quota/);
    } finally {
      await db.query("ROLLBACK");
    }
    process.env.APP_ENV = "trial";
    await assert.rejects(budget(1), { status: 403 });
    await assert.rejects(reserve(randomUUID()), { status: 403 });
    process.env.APP_ENV = "local";
    // Independent quota-boundary history: real frozen batches, with bulk-loaded historical mock receipts.
    await p.delete({ collection: "subscription-campaign-mock-slots", where: {} });
    for (const group of ["hist-a", "hist-b"]) {
      const privacy = group + key;
      process.env.PRIVACY_VERSION = privacy;
      await db.query(
        `INSERT INTO subscriptions(email,topic,locale,status,consent_version,privacy_version,source_path,consented_at,confirmed_at)
        SELECT $1||'-'||i||'@example.invalid','policy-updates','en','confirmed',1,$2,'/en',now(),now() FROM generate_series(1,1000)i`,
        [group + key, privacy],
      );
      const history = await fresh();
      const historyBudget = await budget(2000);
      await db.query(
        `INSERT INTO subscription_campaign_mock_slots(key,job_id,batch_id,budget_id,recipient_hash,reserved_at)
        SELECT '00000000-0000-4000-8000-'||lpad(j.id::text,12,'0'),j.id,j.batch_id,$1,j.recipient_hash,
          date_trunc('day',statement_timestamp() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'
        FROM subscription_campaign_jobs j WHERE j.batch_id=$2`,
        [historyBudget.id, history.batch.id],
      );
    }
    assert.equal(await count(), 2000);
    process.env.PRIVACY_VERSION = key;
    await prepare(input);
    await budget(2000);
    assert.equal((await reserve(randomUUID())).state, "daily-limit");
    assert.equal(await count(), 2000);
    await budget(2000);
    assert.equal(
      (await reserve(randomUUID())).state,
      "daily-limit",
      "new budget must not bypass daily limit",
    );
    await db.query(
      `UPDATE subscription_campaign_mock_slots SET reserved_at=(date_trunc('day',statement_timestamp() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')-interval '1 millisecond'`,
    );
    assert.equal((await reserve(randomUUID())).state, "reserved-local");
    assert.equal(await count(), 2001);
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int n FROM subscription_campaign_mock_slots WHERE (reserved_at AT TIME ZONE 'Asia/Shanghai')::date=(statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date`,
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        `INSERT INTO subscription_campaign_mock_slots(key,job_id,batch_id,budget_id,recipient_hash,reserved_at)
      SELECT $1,job_id,batch_id,budget_id,recipient_hash,reserved_at FROM subscription_campaign_mock_slots LIMIT 1`,
        [randomUUID()],
      ),
      /unique/i,
    );
    process.env.PRIVACY_VERSION = "hist-b" + key;
    const dense = await fresh();
    const candidates = (
      await p.find({
        collection: "subscription-campaign-jobs",
        depth: 0,
        pagination: false,
        sort: "id",
        where: { batch: { equals: dense.batch.id } },
      })
    ).docs;
    assert.equal(candidates.length, 1000);
    // Anchor this load fixture after freezing; the separate midnight assertions remain above.
    await db.query(
      `UPDATE subscription_campaign_mock_slots SET reserved_at=statement_timestamp()-interval '1 hour'
      WHERE recipient_hash IN (SELECT recipient_hash FROM subscription_campaign_jobs WHERE batch_id=$1)`,
      [dense.batch.id],
    );
    const beforeDense = await count();
    const originalCount = p.count;
    let recipientCounts = 0;
    p.count = (options) => {
      if (options.collection === "subscription-campaign-mock-slots") recipientCounts++;
      return originalCount.call(p, options);
    };
    try {
      assert.equal(
        (await reserveMockCampaignSlot(p, manager, { ...dense.input, key: randomUUID() })).state,
        "email-limit",
      );
      assert.equal(recipientCounts, 0, "1,000 blocked candidates must not cause per-email counts");
      const last = candidates.at(-1)!;
      await db.query(
        "UPDATE subscription_campaign_mock_slots SET reserved_at=statement_timestamp()-interval '24 hours 1 millisecond' WHERE recipient_hash=$1",
        [last.recipientHash],
      );
      const result = await reserveMockCampaignSlot(p, manager, {
        ...dense.input,
        key: randomUUID(),
      });
      assert.equal(result.state, "reserved-local");
      assert.equal(recipientCounts, 0, "skip 999 blocked candidates without per-email counts");
      const receipt = await p.findByID({
        collection: "subscription-campaign-mock-slots",
        id: result.id!,
        depth: 0,
      });
      assert.equal(receipt.job, last.id);
    } finally {
      p.count = originalCount;
    }
    assert.equal(await count(), beforeDense + 1, "only the newly eligible recipient gets a slot");
    process.env.PRIVACY_VERSION = key;
    await prepare(input);
    assert.deepEqual(
      (await databaseFingerprints(db)).find((row) => row.table === "subscription_mail_jobs"),
      mailBefore,
    );
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(reserve(randomUUID()), { status: 403 });
    console.log(
      "PASS 本地模拟余额、唯一占位、并发限额、北京日界线、滚动24小时、千人限额批量查询、权限与审计回滚",
    );
  } finally {
    await p.delete({ collection: "subscription-campaign-mock-slots", where: {} });
    await p.delete({ collection: "subscription-campaign-mock-budgets", where: {} });
    await p.delete({ collection: "subscription-campaign-jobs", where: {} });
    await p.delete({ collection: "subscription-campaign-batches", where: {} });
    await p.delete({
      collection: "subscription-campaign-checks",
      where: { kind: { equals: "mock-confirm" } },
    });
    await p.delete({ collection: "subscription-campaign-checks", where: {} });
    await p.delete({
      collection: "subscription-campaign-drafts",
      where: { owner: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-grants",
      where: { staff: { in: people } },
    });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await db.query("DELETE FROM subscriptions WHERE privacy_version IN ($1,$2,$3)", [
      key,
      "hist-a" + key,
      "hist-b" + key,
    ]);
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
