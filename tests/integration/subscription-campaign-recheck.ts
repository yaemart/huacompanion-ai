import {
  up as upContinuation,
  down as downContinuation,
} from "../../src/migrations/20261124_090000_subscription_campaign_continuation";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { recheckCampaignRecipients } from "../../src/server/subscription-campaign-recheck";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  startSubscription,
  confirmSubscription,
  unsubscribeSubscription,
} from "../../src/server/subscriptions";
import { up, down } from "../../src/migrations/20261120_170000_subscription_campaign_recheck";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignRecheck(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const db = new pg.Client({ connectionString: url.toString() });
  const people: number[] = [];
  const subscribers: number[] = [];
  const adapter = { db: { execute: (statement: string) => db.query(statement) } };
  await db.connect();
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构任务复核",
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
    const subscribe = async (name: string, locale: "zh" | "en" = "en") => {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${name}-${key}@example.invalid`,
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
      subscribers.push(row.id);
      return row;
    };
    await subscribe("keep", "zh");
    const version = await subscribe("version");
    const contact = await subscribe("contact");
    const language = await subscribe("language");
    const privacy = await subscribe("privacy");
    const consent = {
      email: `life-${key}@example.invalid`,
      topic: "policy-updates",
      locale: "en",
      privacyVersion: key,
      sourcePath: "/en",
    };
    const firstTokens = await startSubscription(p, consent);
    assert.ok(firstTokens);
    assert.equal(await confirmSubscription(p, firstTokens.confirm), true);
    const life = (
      await p.find({
        collection: "subscriptions",
        where: { email: { equals: consent.email } },
        depth: 0,
      })
    ).docs[0];
    subscribers.push(life.id);
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const recheck = () => recheckCampaignRecipients(p, manager, input);
    await assert.rejects(recheck(), { status: 409 });
    await prepare(input);
    await assert.rejects(recheck(), { status: 409 }, "a saved snapshot is required");
    const frozen = await freezeCampaignRecipients(p, manager, input);
    assert.deepEqual(frozen.counts, { zh: 1, en: 5 });
    const jobs = () =>
      p.find({
        collection: "subscription-campaign-jobs",
        where: { batch: { equals: frozen.id } },
        depth: 0,
        pagination: false,
      });
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await downContinuation(adapter as unknown as MigrateDownArgs);
      await down(adapter as unknown as MigrateDownArgs);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM subscription_campaign_jobs WHERE status='held'",
          )
        ).rows[0].n,
        6,
      );
      await up(adapter as unknown as MigrateUpArgs);
      await upContinuation(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const who of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ])
      await assert.rejects(recheckCampaignRecipients(p, who, input), { status: 403 });
    await assert.rejects(recheckCampaignRecipients(p, other, input), { status: 404 });
    await assert.rejects(
      recheckCampaignRecipients(p, manager, { ...input, email: consent.email }),
      { status: 400 },
    );
    process.env.APP_ENV = "trial";
    await assert.rejects(recheck(), { status: 403 });
    process.env.APP_ENV = "local";
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await assert.rejects(recheck(), { status: 409 });
    if (env.WORKFLOW_MAIL_FROM === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = env.WORKFLOW_MAIL_FROM;
    await assert.rejects(recheck(), { status: 409 });
    await prepare(input);
    const active = (
      await db.query(
        "SELECT id, active_fact_version_id FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
      )
    ).rows;
    try {
      await db.query(
        "UPDATE policy_groups SET active_fact_version_id=NULL WHERE active_fact_version_id IS NOT NULL",
      );
      await assert.rejects(recheck(), { status: 409 });
    } finally {
      for (const row of active)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.active_fact_version_id,
          row.id,
        ]);
    }
    assert.ok((await jobs()).docs.every((job) => job.status === "held"));
    await prepare(input);
    const failureDraft = await saveCampaignDraft(p, manager, { policies });
    const failureInput = { campaignKey: failureDraft.campaignKey, revision: failureDraft.revision };
    await prepare(failureInput);
    const failureBatch = await freezeCampaignRecipients(p, manager, failureInput);
    await p.update({
      collection: "subscriptions",
      id: privacy.id,
      data: { privacyVersion: "old" },
    });
    await db.query(`CREATE FUNCTION reject_recheck_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='recheck-local' THEN RAISE EXCEPTION 'fixture rejects recheck audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_recheck_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_recheck_commit();`);
    try {
      await assert.rejects(recheckCampaignRecipients(p, manager, failureInput), { status: 503 });
      const failedJobs = await p.find({
        collection: "subscription-campaign-jobs",
        where: { batch: { equals: failureBatch.id } },
        depth: 0,
        pagination: false,
      });
      assert.ok(
        failedJobs.docs.every(
          (job) => job.status === "held" && !job.cancelledAt && !job.cancelReason,
        ),
      );
    } finally {
      await db.query(
        "DROP TRIGGER reject_recheck_commit ON audit_events; DROP FUNCTION reject_recheck_commit()",
      );
    }
    const mailJobs = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    assert.equal(await unsubscribeSubscription(p, firstTokens.unsubscribe), true);
    await p.update({ collection: "subscriptions", id: version.id, data: { consentVersion: 2 } });
    await p.update({
      collection: "subscriptions",
      id: contact.id,
      data: { email: `changed-${key}@example.invalid` },
    });
    await p.update({ collection: "subscriptions", id: language.id, data: { locale: "zh" } });
    await subscribe("late");
    const results = await Promise.all(Array.from({ length: 5 }, recheck));
    assert.equal(
      results.reduce((sum, row) => sum + row.newlyCancelled, 0),
      5,
    );
    for (const result of results) {
      assert.deepEqual(result.held, { zh: 1, en: 0 });
      assert.deepEqual(result.cancelled, {
        ineligible: 2,
        consentChanged: 1,
        contactChanged: 2,
        campaignCancelled: 0,
      });
      assert.doesNotMatch(
        JSON.stringify(result),
        /@|email|recipientHash|password|token|subscription/,
      );
    }
    assert.equal((await jobs()).totalDocs, 6);
    assert.equal((await jobs()).docs.filter((job) => job.status === "cancelled").length, 5);
    assert.ok(
      (await jobs()).docs
        .filter((job) => job.status === "cancelled")
        .every((job) => job.cancelledAt && job.cancelReason),
    );
    assert.deepEqual(
      (await p.findByID({ collection: "subscription-campaign-batches", id: frozen.id })).counts,
      { zh: 1, en: 5 },
    );
    const newTokens = await startSubscription(p, consent);
    assert.ok(newTokens);
    assert.equal(await confirmSubscription(p, newTokens.confirm), true);
    await p.update({ collection: "subscriptions", id: privacy.id, data: { privacyVersion: key } });
    await p.update({ collection: "subscriptions", id: contact.id, data: { email: contact.email } });
    await p.update({ collection: "subscriptions", id: language.id, data: { locale: "en" } });
    const again = await recheck();
    assert.equal(again.newlyCancelled, 0);
    assert.deepEqual(again.cancelled, results[0].cancelled);
    assert.deepEqual(again.held, { zh: 1, en: 0 });
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down(adapter as unknown as MigrateDownArgs),
        /Preserve campaign cancellations/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(recheck(), { status: 403 });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    await assert.rejects(recheck(), { status: 409 });
    const next = await saveCampaignDraft(p, manager, { ...input, policies });
    await assert.rejects(recheck(), { status: 409 });
    const nextInput = { campaignKey: next.campaignKey, revision: next.revision };
    await prepare(nextInput);
    await assert.rejects(recheckCampaignRecipients(p, manager, nextInput), { status: 409 });
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, mailJobs);
    const audits = await p.find({
      collection: "audit-events",
      where: { action: { equals: "recheck-local" } },
      depth: 0,
      pagination: false,
    });
    assert.equal(audits.totalDocs, 6);
    assert.doesNotMatch(
      JSON.stringify(audits.docs),
      /@example.invalid|recipientHash|API_KEY|password|token/,
    );
    console.log("PASS 冻结任务实时资格复核、持久取消、重订不复活、并发、权限及审计提交回滚");
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
    await p.delete({
      collection: "subscription-credentials",
      where: { subscription: { in: subscribers } },
    });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
