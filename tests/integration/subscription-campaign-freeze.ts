import {
  up as upAttempts,
  down as downAttempts,
} from "../../src/migrations/20261121_213000_subscription_campaign_mock_attempts";
import {
  up as upLeases,
  down as downLeases,
} from "../../src/migrations/20261121_130000_subscription_campaign_mock_leases";
import {
  up as upQuota,
  down as downQuota,
} from "../../src/migrations/20261121_090000_subscription_campaign_mock_quota";
import {
  up as upRecheck,
  down as downRecheck,
} from "../../src/migrations/20261120_170000_subscription_campaign_recheck";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  campaignMockChecks,
  withConfirmedCampaign,
} from "../../src/server/subscription-campaign-mock-checks";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  readCampaignDraft,
  saveCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { ContentError } from "../../src/server/content/error";
import { up, down } from "../../src/migrations/20261120_150000_subscription_campaign_freeze";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignFreeze(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const db = new pg.Client({ connectionString: url.toString() });
  const people: number[] = [];
  const subscriptions: number[] = [];
  await db.connect();
  const adapter = { db: { execute: (value: string) => db.query(value) } };
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构冻结测试",
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
    for (const who of [manager, other])
      await setCampaignGrant(p, admin, { staffId: who.id, topic: "policy-updates", enabled: true });
    const workspace = await readCampaignWorkspace(p, manager);
    const policies = [
      workspace.choices.find((choice) => choice.policies.zh && choice.policies.en)!.policies,
    ];
    const freshDraft = async () => {
      const draft = await saveCampaignDraft(p, manager, { policies });
      return { campaignKey: draft.campaignKey, revision: draft.revision };
    };
    const prepare = async (input: Awaited<ReturnType<typeof freshDraft>>) => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: test.messages.map((message) => message.locale),
      });
    };
    const subscribe = async (suffix: string, extra: Record<string, unknown> = {}) => {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${suffix}-${key}@example.invalid`,
          topic: "policy-updates",
          locale: "en",
          status: "confirmed",
          consentVersion: 1,
          privacyVersion: key,
          sourcePath: "/en",
          consentedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          ...extra,
        },
      });
      subscriptions.push(row.id);
      return row;
    };
    await subscribe("zh", { locale: "zh" });
    const english = await subscribe("en");
    await subscribe("duplicate", { email: english.email.toUpperCase() });
    const withdrawn = await subscribe("withdrawn-normalized");
    await subscribe("withdrawn-normalized-later", {
      email: withdrawn.email.toUpperCase(),
      status: "unsubscribed",
    });

    const paddedOriginal = await subscribe("padded-withdrawal-original");
    const paddedWithdrawal = await subscribe("padded-withdrawal-later", { status: "unsubscribed" });
    await db.query("UPDATE subscriptions SET email=$1 WHERE id=$2", [
      "\t\u00a0" + paddedOriginal.email.toUpperCase() + "\u00a0\t",
      paddedWithdrawal.id,
    ]);
    await subscribe("pending", { status: "pending" });
    await subscribe("unsubscribed", { status: "unsubscribed" });
    await subscribe("unconfirmed", { confirmedAt: null });
    await subscribe("old-privacy", { privacyVersion: "old" });
    await subscribe("other-topic", { topic: "procurement-guides" });
    await subscribe("missing-language", { locale: "fr" });
    const zero = await subscribe("zero-version");
    await db.query("UPDATE subscriptions SET consent_version=0 WHERE id=$1", [zero.id]);
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await downAttempts(adapter as unknown as MigrateDownArgs);
      await downLeases(adapter as unknown as MigrateDownArgs);
      await downQuota(adapter as unknown as MigrateDownArgs);
      await downRecheck(adapter as unknown as MigrateDownArgs);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      await upRecheck(adapter as unknown as MigrateUpArgs);
      await upQuota(adapter as unknown as MigrateUpArgs);
      await upLeases(adapter as unknown as MigrateUpArgs);
      await upAttempts(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const collection of [
      "subscription-campaign-batches",
      "subscription-campaign-jobs",
    ] as const) {
      for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
        const scope = { collection, user, overrideAccess: false };
        await assert.rejects(p.find(scope), { status: 403 });
        await assert.rejects(p.create({ ...scope, data: {} as never }), { status: 403 });
      }
    }
    const input = await freshDraft();
    assert.deepEqual(
      (await readCampaignDraft(p, manager, input.campaignKey)).counts,
      { zh: 1, en: 1, excluded: 1 },
      "preview must share canonical latest-consent eligibility",
    );
    const freeze = () => freezeCampaignRecipients(p, manager, input);
    for (const who of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ])
      await assert.rejects(freezeCampaignRecipients(p, who, input), { status: 403 });
    await assert.rejects(freezeCampaignRecipients(p, other, input), { status: 404 });
    await assert.rejects(freeze(), { status: 409 });
    const firstTest = await campaignMockChecks(p, manager, "test", input);
    await assert.rejects(freeze(), { status: 409 });
    await campaignMockChecks(p, manager, "confirm", {
      ...input,
      testId: firstTest.testId,
      readable: ["zh", "en"],
    });
    for (const value of [{ ...input, counts: {} }, { ...input, emails: [] }, null])
      await assert.rejects(freezeCampaignRecipients(p, manager, value), { status: 400 });
    const mailCount = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    const frozen = await Promise.all(Array.from({ length: 5 }, freeze));
    assert.ok(frozen.every((row) => row.id === frozen[0].id));
    assert.deepEqual(frozen[0].counts, { zh: 1, en: 1 });
    assert.doesNotMatch(
      JSON.stringify(frozen),
      /email|recipientHash|consentVersion|example.invalid/,
    );
    const jobs = await p.find({
      collection: "subscription-campaign-jobs",
      depth: 0,
      pagination: false,
    });
    assert.equal(jobs.totalDocs, 2);
    for (const collection of [
      "subscription-campaign-batches",
      "subscription-campaign-jobs",
    ] as const) {
      const id = collection === "subscription-campaign-batches" ? frozen[0].id : jobs.docs[0].id;
      for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
        const scope = { collection, id, user, overrideAccess: false };
        await assert.rejects(p.findByID(scope), { status: 403 });
        await assert.rejects(p.update({ ...scope, data: {} }), { status: 403 });
        await assert.rejects(p.delete(scope), { status: 403 });
      }
    }

    assert.ok(jobs.docs.every((row) => row.status === "held"));
    assert.ok(jobs.docs.every((row) => row.consentVersion === 1));
    assert.doesNotMatch(JSON.stringify(jobs.docs), /@example.invalid/);
    await assert.rejects(
      db.query(`INSERT INTO subscription_campaign_jobs
      (campaign_key,batch_id,subscription_id,consent_version,locale,recipient_hash,status)
      SELECT campaign_key,batch_id,subscription_id,consent_version,locale,recipient_hash,status
      FROM subscription_campaign_jobs LIMIT 1`),
      /unique/i,
    );
    await subscribe("late");
    assert.deepEqual(await freeze(), frozen[0], "late subscribers must not expand frozen cohort");
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down(adapter as unknown as MigrateDownArgs),
        /Preserve campaign snapshots/,
      );
    } finally {
      await db.query("ROLLBACK");
    }

    const activeGroups = (
      await db.query(
        "SELECT id, active_fact_version_id FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
      )
    ).rows;
    assert.ok(activeGroups.length);
    try {
      await db.query(
        "UPDATE policy_groups SET active_fact_version_id=NULL WHERE active_fact_version_id IS NOT NULL",
      );
      await assert.rejects(freeze(), { status: 409 });
    } finally {
      for (const group of activeGroups)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          group.active_fact_version_id,
          group.id,
        ]);
    }
    await assert.rejects(
      freeze(),
      { status: 409 },
      "restored source cannot revive old confirmation",
    );
    await prepare(input);
    assert.deepEqual(await freeze(), frozen[0]);
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await assert.rejects(freeze(), { status: 409 });
    if (env.WORKFLOW_MAIL_FROM === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = env.WORKFLOW_MAIL_FROM;
    await assert.rejects(
      freeze(),
      { status: 409 },
      "old proof stays invalid after restored config",
    );
    await prepare(input);
    assert.deepEqual(await freeze(), frozen[0]);
    process.env.APP_ENV = "trial";
    await assert.rejects(freeze(), { status: 403 });
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(freeze(), { status: 403 });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    await assert.rejects(freeze(), { status: 409 });
    const next = await saveCampaignDraft(p, manager, { ...input, policies });
    await assert.rejects(freeze(), { status: 409 });
    const nextInput = { campaignKey: next.campaignKey, revision: next.revision };
    await prepare(nextInput);
    await assert.rejects(freezeCampaignRecipients(p, manager, nextInput), { status: 409 });
    const failedInput = await freshDraft();
    await prepare(failedInput);
    const auditBefore = (await p.count({ collection: "audit-events" })).totalDocs;
    await assert.rejects(
      withConfirmedCampaign(p, manager, failedInput, async (req) => {
        await p.create({
          collection: "audit-events",
          req,
          data: {
            entity: "freeze-fixture",
            recordId: key,
            action: "abort",
            actor: manager.id,
            fields: "none",
          },
        });
        throw new ContentError("fixture rejects after write", 400);
      }),
      { status: 400 },
    );
    assert.equal((await p.count({ collection: "audit-events" })).totalDocs, auditBefore);
    await db.query(`CREATE FUNCTION reject_freeze_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-batches' THEN RAISE EXCEPTION 'reject freeze audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_freeze_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_freeze_commit();`);
    const beforeBatches = (await p.count({ collection: "subscription-campaign-batches" }))
      .totalDocs;
    const beforeJobs = (await p.count({ collection: "subscription-campaign-jobs" })).totalDocs;
    try {
      await assert.rejects(freezeCampaignRecipients(p, manager, failedInput), { status: 503 });
      assert.equal(
        (await p.count({ collection: "subscription-campaign-batches" })).totalDocs,
        beforeBatches,
      );
      assert.equal(
        (await p.count({ collection: "subscription-campaign-jobs" })).totalDocs,
        beforeJobs,
      );
    } finally {
      await db.query(
        "DROP TRIGGER reject_freeze_commit ON audit_events; DROP FUNCTION reject_freeze_commit()",
      );
    }
    process.env.PRIVACY_VERSION = "limit-" + key;
    await db.query(
      `INSERT INTO subscriptions(email,topic,locale,status,consent_version,privacy_version,source_path,consented_at,confirmed_at)
      SELECT 'bulk-'||i||'-'||$1||'@example.invalid','policy-updates','en','confirmed',1,$2,'/en',now(),now()
      FROM generate_series(1,1000) i`,
      [key, process.env.PRIVACY_VERSION],
    );
    const limitInput = await freshDraft();
    await prepare(limitInput);
    assert.deepEqual((await freezeCampaignRecipients(p, manager, limitInput)).counts, {
      zh: 0,
      en: 1000,
    });
    await subscribe("over-limit", { privacyVersion: process.env.PRIVACY_VERSION });
    const overLimit = await freshDraft();
    await prepare(overLimit);
    const batchCount = (await p.count({ collection: "subscription-campaign-batches" })).totalDocs;
    await assert.rejects(freezeCampaignRecipients(p, manager, overLimit), { status: 400 });
    assert.equal(
      (await p.count({ collection: "subscription-campaign-batches" })).totalDocs,
      batchCount,
    );
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, mailCount);
    console.log("PASS 本地收件快照、同意与语言过滤、并发去重、不补新人、千人上限、权限和审计回滚");
  } finally {
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
    await db.query("DELETE FROM subscriptions WHERE id=ANY($1::int[]) OR email ILIKE $2", [
      subscriptions,
      `%${key}@example.invalid`,
    ]);
    await db.end();
    for (const variable of Object.keys(process.env))
      if (!(variable in env)) delete process.env[variable];
    Object.assign(process.env, env);
  }
}
