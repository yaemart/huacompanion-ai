import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import {
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";
import { up, down } from "../../src/migrations/20261121_213000_subscription_campaign_mock_attempts";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignRetries(p: Payload, url: URL) {
  const env = { ...process.env },
    key = randomUUID();
  const people: number[] = [],
    subscribers: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  let child: ChildProcess | undefined;
  const collection = "subscription-campaign-mock-attempts";
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const row = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构重试测试",
          email: `${people.length}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(row.id);
      return row;
    };
    const admin = await person("admin"),
      manager = await person("manager"),
      other = await person("manager");
    const operations = await person("operations"),
      editor = await person("editor"),
      reviewer = await person("reviewer");
    for (const actor of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: actor.id,
        topic: "policy-updates",
        enabled: true,
      });
    const policies = [
      (await readCampaignWorkspace(p, manager)).choices.find((r) => r.policies.zh && r.policies.en)!
        .policies,
    ];
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const prepare = async () => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    await prepare();
    for (let i = 0; i < 10; i++) {
      const sub = await p.create({
        collection: "subscriptions",
        data: {
          email: `${i}-${key}@example.invalid`,
          topic: "policy-updates",
          locale: "en",
          status: "confirmed",
          consentVersion: 1,
          consentedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          privacyVersion: key,
          sourcePath: "/en",
        },
      });
      subscribers.push(sub.id);
    }
    await freezeCampaignRecipients(p, manager, input);
    await setMockCampaignBudget(p, admin, { remaining: 10, reason: "虚构重试余额" });
    const fresh = async () => {
      const slot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      const target = { ...input, slotId: slot.id! };
      const lease = await claimMockCampaignTask(p, manager, target);
      if (lease.state !== "claimed-local") throw Error("missing claimed lease");
      return { target, lease, leased: { ...target, token: lease.token } };
    };
    const current = await fresh();
    const row = async (slotId = current.target.slotId) =>
      (await p.find({ collection, depth: 0, limit: 1, where: { slot: { equals: slotId } } }))
        .docs[0];
    const moveDue = (slotId: number) =>
      db.query(
        "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=statement_timestamp()-interval '1 millisecond' WHERE slot_id=$1",
        [slotId],
      );
    const expired = (leaseId: number) =>
      db.query(
        "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 millisecond' WHERE id=$1",
        [leaseId],
      );
    const mailBefore = (await databaseFingerprints(db)).find(
      (r) => r.table === "subscription_mail_jobs",
    );
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const actor of [undefined, admin, manager, other, operations, editor, reviewer])
      await assert.rejects(p.find({ collection, user: actor, overrideAccess: false }), {
        status: 403,
      });
    for (const actor of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ]) {
      await assert.rejects(beginMockCampaignAttempt(p, actor, current.leased), { status: 403 });
      await assert.rejects(
        recordMockCampaignOutcome(p, actor, { ...current.leased, outcome: "accepted" }),
        { status: 403 },
      );
    }
    await assert.rejects(beginMockCampaignAttempt(p, other, current.leased), { status: 404 });
    await assert.rejects(
      recordMockCampaignOutcome(p, other, { ...current.leased, outcome: "accepted" }),
      { status: 404 },
    );
    for (const bad of [
      null,
      {},
      { ...current.leased, key: "forged" },
      { ...current.leased, attemptedAt: [] },
      { ...current.leased, now: 0 },
      { ...current.leased, token: "invalid" },
    ])
      await assert.rejects(beginMockCampaignAttempt(p, manager, bad), { status: 400 });
    for (const bad of [
      { ...current.leased, outcome: "sent" },
      { ...current.leased, outcome: "rate-limited", retryAfterMs: -1 },
      { ...current.leased, outcome: "temporary", retryAfterMs: 100 },
      { ...current.leased, outcome: "rate-limited", retryAfterMs: Infinity },
    ])
      await assert.rejects(recordMockCampaignOutcome(p, manager, bad), { status: 400 });
    await assert.rejects(
      beginMockCampaignAttempt(p, manager, { ...current.leased, revision: 99 }),
      { status: 409 },
    );
    await assert.rejects(
      recordMockCampaignOutcome(p, manager, { ...current.leased, outcome: "accepted" }),
      { status: 409 },
    );
    process.env.APP_ENV = "trial";
    await assert.rejects(beginMockCampaignAttempt(p, manager, current.leased), { status: 403 });
    process.env.APP_ENV = "local";
    // An audit failure at COMMIT must roll back both an attempt and a lease result.
    const rejectAudit = () =>
      db.query(`CREATE FUNCTION reject_mock_attempt_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-mock-attempts' THEN RAISE EXCEPTION 'reject attempt audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_mock_attempt_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_mock_attempt_commit();`);
    const allowAudit = () =>
      db.query(
        "DROP TRIGGER reject_mock_attempt_commit ON audit_events; DROP FUNCTION reject_mock_attempt_commit()",
      );
    await rejectAudit();
    try {
      const before = await databaseFingerprints(db);
      await assert.rejects(beginMockCampaignAttempt(p, manager, current.leased), { status: 503 });
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await allowAudit();
    }
    await db.query("SELECT setval('subscription_campaign_mock_attempts_id_seq',1000000,true)");
    child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: process.env,
    });
    await once(child, "message", { signal: AbortSignal.timeout(45000) });
    const childBegin = once(child, "message", { signal: AbortSignal.timeout(45000) });
    child.send({ actorId: manager.id, action: "begin", input: current.leased });
    const begun = await beginMockCampaignAttempt(p, manager, current.leased);
    assert.equal(begun.state, "attempting-local");
    const childBegan = (await childBegin)[0].report;
    assert.equal(childBegan.state, "attempting-local");
    assert.equal(Number("started" in begun && begun.started) + Number(childBegan.started), 1);
    const first = await row();
    assert.notEqual(first.id, current.target.slotId);
    assert.equal(
      (
        await p.count({
          collection: "audit-events",
          where: {
            and: [
              { entity: { equals: collection } },
              { action: { equals: "begin-mock-attempt" } },
              { recordId: { equals: String(first.id) } },
            ],
          },
        })
      ).totalDocs,
      1,
    );
    assert.equal((first.attemptedAt as string[]).length, 1);
    assert.match(first.key, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(first).includes(current.lease.token), false);
    assert.equal(
      (await completeMockCampaignTask(p, manager, current.leased)).state,
      "attempting-local",
    );
    await rejectAudit();
    try {
      const before = await databaseFingerprints(db);
      await assert.rejects(
        recordMockCampaignOutcome(p, manager, { ...current.leased, outcome: "temporary" }),
        { status: 503 },
      );
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await allowAudit();
    }
    const beforeRetry = await db.query(
      "SELECT floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms",
    );
    const retry = await recordMockCampaignOutcome(p, manager, {
      ...current.leased,
      outcome: "rate-limited",
      retryAfterMs: 120000,
    });
    assert.equal(retry.state, "retry-local");
    const waiting = await row();
    assert.ok(Date.parse(waiting.nextAttemptAt!) - Number(beforeRetry.rows[0].ms) >= 120000);
    assert.equal((await claimMockCampaignTask(p, manager, current.target)).state, "retry-local");
    assert.equal((await completeMockCampaignTask(p, manager, current.leased)).state, "retry-local");
    const repeated = await recordMockCampaignOutcome(p, manager, {
      ...current.leased,
      outcome: "rate-limited",
      retryAfterMs: 120000,
    });
    assert.equal(repeated.state, "retry-local");
    assert.deepEqual(await row(), waiting);
    await assert.rejects(
      recordMockCampaignOutcome(p, manager, { ...current.leased, outcome: "accepted" }),
      { status: 409 },
    );
    let token = current.lease.token;
    for (let attempt = 2; attempt <= 5; attempt++) {
      await moveDue(current.target.slotId);
      const lease = await claimMockCampaignTask(p, manager, current.target);
      if (lease.state !== "claimed-local") throw Error("missing retry lease");
      assert.notEqual(lease.token, token);
      await assert.rejects(
        recordMockCampaignOutcome(p, manager, { ...current.target, token, outcome: "accepted" }),
        { status: 409 },
      );
      token = lease.token;
      assert.equal(
        (await beginMockCampaignAttempt(p, manager, { ...current.target, token })).state,
        "attempting-local",
      );
      const attempted = await row();
      assert.equal((attempted.attemptedAt as string[]).length, attempt);
      assert.equal(attempted.key, first.key);
      assert.deepEqual(attempted.message, first.message);
      const outcome = await recordMockCampaignOutcome(p, manager, {
        ...current.target,
        token,
        outcome: "temporary",
      });
      assert.equal(outcome.state, attempt === 5 ? "review-local" : "retry-local");
    }
    assert.equal((await claimMockCampaignTask(p, manager, current.target)).state, "review-local");
    assert.equal(
      (await completeMockCampaignTask(p, manager, { ...current.target, token })).state,
      "review-local",
    );
    assert.equal((await row()).state, "review");
    const concurrent = await fresh();
    await beginMockCampaignAttempt(p, manager, concurrent.leased);
    const childResult = once(child, "message", { signal: AbortSignal.timeout(45000) });
    child.send({
      actorId: manager.id,
      action: "result",
      input: { ...concurrent.leased, outcome: "accepted" },
    });
    assert.equal(
      (await recordMockCampaignOutcome(p, manager, { ...concurrent.leased, outcome: "accepted" }))
        .state,
      "completed-local",
    );
    assert.equal((await childResult)[0].report.state, "completed-local");
    assert.equal(
      (
        await p.count({
          collection: "audit-events",
          where: {
            and: [
              { entity: { equals: collection } },
              { action: { equals: "outcome-mock-attempt" } },
              { recordId: { equals: String((await row(concurrent.target.slotId)).id) } },
            ],
          },
        })
      ).totalDocs,
      1,
    );
    assert.equal(((await row(concurrent.target.slotId)).attemptedAt as string[]).length, 1);
    // A running attempt with an expired lease has an unknown result, not a safe new attempt.
    const interrupted = await fresh();
    const childAttempt = once(child, "message", { signal: AbortSignal.timeout(45000) });
    child.send({ actorId: manager.id, action: "begin", input: interrupted.leased });
    assert.equal((await childAttempt)[0].report.state, "attempting-local");
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
    child = undefined;
    await expired(interrupted.lease.id);
    assert.equal(
      (await claimMockCampaignTask(p, manager, interrupted.target)).state,
      "review-local",
    );
    assert.equal(
      (await recordMockCampaignOutcome(p, manager, { ...interrupted.leased, outcome: "accepted" }))
        .state,
      "review-local",
    );
    assert.equal((await row(interrupted.target.slotId)).state, "review");
    // Acquiring but not starting an attempt still permits the original safe lease recovery.
    const notStarted = await fresh();
    await expired(notStarted.lease.id);
    assert.equal(
      (await claimMockCampaignTask(p, manager, notStarted.target)).state,
      "claimed-local",
    );
    assert.equal(await row(notStarted.target.slotId), undefined);
    for (const [outcome, expected] of [
      ["unknown", "review-local"],
      ["permanent", "failed-local"],
      ["accepted", "completed-local"],
    ] as const) {
      const item = await fresh();
      await beginMockCampaignAttempt(p, manager, item.leased);
      const result = await recordMockCampaignOutcome(p, manager, { ...item.leased, outcome });
      assert.equal(result.state, expected);
      assert.equal((await claimMockCampaignTask(p, manager, item.target)).state, expected);
      assert.equal((await completeMockCampaignTask(p, manager, item.leased)).state, expected);
      assert.equal(
        (await recordMockCampaignOutcome(p, manager, { ...item.leased, outcome })).state,
        expected,
      );
    }
    const tooLong = await fresh();
    await beginMockCampaignAttempt(p, manager, tooLong.leased);
    assert.equal(
      (
        await recordMockCampaignOutcome(p, manager, {
          ...tooLong.leased,
          outcome: "rate-limited",
          retryAfterMs: 86400000,
        })
      ).state,
      "review-local",
    );
    const deadline = await fresh();
    await beginMockCampaignAttempt(p, manager, deadline.leased);
    await recordMockCampaignOutcome(p, manager, { ...deadline.leased, outcome: "temporary" });
    await db.query(
      `UPDATE subscription_campaign_mock_attempts SET attempted_at=jsonb_build_array(
      statement_timestamp()-interval '23 hours') WHERE slot_id=$1`,
      [deadline.target.slotId],
    );
    assert.equal((await claimMockCampaignTask(p, manager, deadline.target)).state, "review-local");
    const permission = await fresh();
    await beginMockCampaignAttempt(p, manager, permission.leased);
    const beforeInvalidation = await row(permission.target.slotId);
    const oldFrom = process.env.WORKFLOW_MAIL_FROM;
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await assert.rejects(
      recordMockCampaignOutcome(p, manager, { ...permission.leased, outcome: "accepted" }),
      { status: 409 },
    );
    if (oldFrom === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = oldFrom;
    await prepare();
    const activeFacts = await db.query<{ id: number; fact: number }>(
      "SELECT id,active_fact_version_id AS fact FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
    );
    try {
      await db.query("UPDATE policy_groups SET active_fact_version_id=NULL");
      await assert.rejects(
        recordMockCampaignOutcome(p, manager, { ...permission.leased, outcome: "accepted" }),
        { status: 409 },
      );
    } finally {
      for (const r of activeFacts.rows)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          r.fact,
          r.id,
        ]);
    }
    assert.deepEqual(await row(permission.target.slotId), beforeInvalidation);
    await prepare();
    const budgetBefore = (
      await p.find({ collection: "subscription-campaign-mock-budgets", depth: 0 })
    ).docs;
    const slotsBefore = (await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 }))
      .docs;
    await setCampaignPause(p, manager, { ...input, paused: true, reason: "重试中暂停" });
    await assert.rejects(
      recordMockCampaignOutcome(p, manager, { ...permission.leased, outcome: "accepted" }),
      { status: 409 },
    );
    await setCampaignPause(p, manager, { ...input, paused: false, reason: "本地恢复" });
    assert.equal(
      (await claimMockCampaignTask(p, manager, permission.target)).state,
      "review-local",
    );
    const permissionSlot = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: permission.target.slotId,
      depth: 0,
    });
    const permissionJob = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: Number(permissionSlot.job),
      depth: 0,
    });
    await p.update({
      collection: "subscriptions",
      id: Number(permissionJob.subscription),
      data: { status: "unsubscribed" },
    });
    assert.equal(
      (
        await recordMockCampaignOutcome(p, manager, {
          ...permission.leased,
          outcome: "accepted",
        })
      ).state,
      "ineligible",
    );
    await p.update({
      collection: "subscriptions",
      id: Number(permissionJob.subscription),
      data: { status: "confirmed", consentVersion: 2 },
    });
    assert.equal(
      (await beginMockCampaignAttempt(p, manager, permission.leased)).state,
      "ineligible",
    );
    assert.equal((await row(permission.target.slotId)).state, "review");
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(beginMockCampaignAttempt(p, manager, permission.leased), { status: 403 });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    await prepare();
    await cancelMockCampaign(p, manager, { ...input, reason: "演练取消后不重试" });
    await assert.rejects(beginMockCampaignAttempt(p, manager, permission.leased), { status: 409 });
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-budgets", depth: 0 })).docs,
      budgetBefore,
    );
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 })).docs,
      slotsBefore,
    );
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve mock attempts/);
    } finally {
      await db.query("ROLLBACK");
    }
    const audits = (
      await p.find({
        collection: "audit-events",
        depth: 0,
        pagination: false,
        where: { entity: { equals: collection } },
      })
    ).docs;
    assert.doesNotMatch(JSON.stringify(audits), /@|leaseTokenHash|subject|FICTIONAL|"token"/);
    const firstAudit = audits.find(
      (a) => a.action === "begin-mock-attempt" && a.recordId === String(first.id),
    );
    assert.equal((firstAudit!.after as { slotId: number }).slotId, current.target.slotId);
    assert.equal((await p.count({ collection: "subscription-campaign-mock-slots" })).totalDocs, 10);
    assert.deepEqual(
      (await databaseFingerprints(db)).find((r) => r.table === "subscription_mail_jobs"),
      mailBefore,
    );
    console.log(
      "PASS 本地模拟重试、固定正文任务键、退避与五次23小时门槛、待核对、中断并发和审计回滚",
    );
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    for (const slug of [
      collection,
      "subscription-campaign-controls",
      "subscription-campaign-mock-leases",
      "subscription-campaign-mock-slots",
      "subscription-campaign-mock-budgets",
      "subscription-campaign-jobs",
      "subscription-campaign-batches",
      "subscription-campaign-checks",
      "subscription-campaign-drafts",
      "subscription-campaign-grants",
    ] as const)
      await p.delete({ collection: slug, where: {} });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
