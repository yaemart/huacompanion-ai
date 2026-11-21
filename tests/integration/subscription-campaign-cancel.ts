import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";
import {
  readCampaignPause,
  setCampaignPause,
} from "../../src/server/subscription-campaign-control";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import {
  freezeCampaignRecipients,
  readCampaignFreeze,
} from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";
import { recheckCampaignRecipients } from "../../src/server/subscription-campaign-recheck";
import { CampaignPauseControls } from "../../src/components/subscriptions/CampaignPauseControls";
import { up, down } from "../../src/migrations/20261121_190000_subscription_campaign_cancel";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignCancel(p: Payload, url: URL) {
  const env = { ...process.env };
  const people: number[] = [];
  const subscribers: number[] = [];
  const key = randomUUID();
  const db = new pg.Client({ connectionString: url.toString() });
  const observer = new pg.Client({ connectionString: url.toString() });
  let child: ChildProcess | undefined;
  await db.connect();
  await observer.connect();
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构取消测试",
          email: `${people.length}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(user.id);
      return user;
    };
    const admin = await person("admin"),
      manager = await person("manager"),
      other = await person("manager");
    const operations = await person("operations"),
      editor = await person("editor"),
      reviewer = await person("reviewer");
    for (const user of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const policies = [
      (await readCampaignWorkspace(p, manager)).choices.find((r) => r.policies.zh && r.policies.en)!
        .policies,
    ];
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const change = { ...input, reason: "虚构取消原因" };
    const beforeMail = (await databaseFingerprints(db)).find(
      (r) => r.table === "subscription_mail_jobs",
    );
    await setCampaignPause(p, manager, { ...input, paused: true, reason: "旧暂停记录" });
    const oldPause = await readCampaignPause(p, manager, input);
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const actor of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ])
      await assert.rejects(cancelMockCampaign(p, actor, change), { status: 403 });
    await assert.rejects(cancelMockCampaign(p, other, change), { status: 404 });
    for (const bad of [
      null,
      [],
      {},
      { ...change, reason: " " },
      { ...change, reason: "x".repeat(501) },
      { ...change, owner: other.id },
      { ...change, revision: "1" },
    ])
      await assert.rejects(cancelMockCampaign(p, manager, bad));
    await assert.rejects(cancelMockCampaign(p, manager, { ...change, revision: 99 }), {
      status: 409,
    });
    process.env.APP_ENV = "trial";
    await assert.rejects(cancelMockCampaign(p, manager, change), { status: 403 });
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(cancelMockCampaign(p, manager, change), { status: 403 });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    // No mock confirmation, already paused, and changed sender: stopping is still allowed.
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    const activeFacts = await db.query<{ id: number; fact: number }>(
      "SELECT id,active_fact_version_id AS fact FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
    );
    let empty: Awaited<ReturnType<typeof cancelMockCampaign>>;
    try {
      await db.query("UPDATE policy_groups SET active_fact_version_id=NULL");
      empty = await cancelMockCampaign(p, manager, change);
    } finally {
      for (const row of activeFacts.rows)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.fact,
          row.id,
        ]);
    }
    assert.equal(empty.cancelledJobs, 0);
    assert.equal(empty.invalidatedLeases, 0);
    const state = await readCampaignPause(p, manager, input);
    assert.ok(state.cancelledAt);
    assert.equal(state.cancelReason, change.reason);
    assert.equal(state.reason, oldPause.reason);
    assert.equal(state.changedAt, oldPause.changedAt);
    const audits = await p.count({
      collection: "audit-events",
      where: { action: { equals: "cancel-local" } },
    });
    await cancelMockCampaign(p, manager, { ...change, reason: "不能覆盖旧原因" });
    assert.deepEqual(await readCampaignPause(p, manager, input), state);
    assert.equal(
      (await p.count({ collection: "audit-events", where: { action: { equals: "cancel-local" } } }))
        .totalDocs,
      audits.totalDocs,
    );
    const rendered = renderToStaticMarkup(
      createElement(CampaignPauseControls, {
        draft: input,
        control: state,
        enabled: true,
        dirty: false,
        canResume: true,
        uncertain: false,
        onChange: () => undefined,
        onUncertainChange: () => undefined,
      }),
    );
    assert.match(rendered, /当前状态：已取消/);
    assert.match(rendered, /不能恢复/);
    assert.match(rendered, /<button[^>]*disabled=""/);
    for (const paused of [true, false])
      await assert.rejects(setCampaignPause(p, manager, { ...input, paused, reason: "不能复活" }), {
        status: 409,
      });
    const newVersion = await saveCampaignDraft(p, manager, { ...input, policies });
    assert.equal(
      (
        await readCampaignPause(p, manager, {
          campaignKey: newVersion.campaignKey,
          revision: newVersion.revision,
        })
      ).cancelledAt,
      state.cancelledAt,
    );
    await assert.rejects(cancelMockCampaign(p, manager, change), { status: 409 });
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down(adapter as unknown as MigrateDownArgs),
        /Preserve campaign cancellations/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    if (env.WORKFLOW_MAIL_FROM === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = env.WORKFLOW_MAIL_FROM;
    const live = await saveCampaignDraft(p, manager, { policies });
    const current = { campaignKey: live.campaignKey, revision: live.revision };
    for (let i = 0; i < 4; i++) {
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
    const test = await campaignMockChecks(p, manager, "test", current);
    await campaignMockChecks(p, manager, "confirm", {
      ...current,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    const frozen = await freezeCampaignRecipients(p, manager, current);
    await setMockCampaignBudget(p, admin, { remaining: 2, reason: "虚构取消额度" });
    const one = await reserveMockCampaignSlot(p, manager, { ...current, key: randomUUID() });
    const two = await reserveMockCampaignSlot(p, manager, { ...current, key: randomUUID() });
    const doneTarget = { ...current, slotId: one.id! },
      pendingTarget = { ...current, slotId: two.id! };
    const doneLease = await claimMockCampaignTask(p, manager, doneTarget);
    const pendingLease = await claimMockCampaignTask(p, manager, pendingTarget);
    if (doneLease.state !== "claimed-local" || pendingLease.state !== "claimed-local")
      throw Error("missing leases");
    await completeMockCampaignTask(p, manager, { ...doneTarget, token: doneLease.token });
    const completedBefore = await p.findByID({
      collection: "subscription-campaign-mock-leases",
      id: doneLease.id,
      depth: 0,
    });
    const allJobs = (
      await p.find({ collection: "subscription-campaign-jobs", pagination: false, depth: 0 })
    ).docs;
    // Quota report does not expose job IDs; use slots to identify the untouched task.
    const slotJobs = (
      await p.find({ collection: "subscription-campaign-mock-slots", pagination: false, depth: 0 })
    ).docs.map((s) => Number(s.job));
    const legacy = allJobs.find((j) => !slotJobs.includes(j.id))!;
    assert.ok(legacy);
    await p.update({
      collection: "subscriptions",
      id: Number(legacy.subscription),
      data: { status: "unsubscribed" },
    });
    await recheckCampaignRecipients(p, manager, current);
    const oldCancelled = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: legacy.id,
      depth: 0,
    });
    const budgetBefore = await p.find({
      collection: "subscription-campaign-mock-budgets",
      depth: 0,
    });
    const slotsBefore = await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 });
    await db.query(`CREATE FUNCTION reject_campaign_cancel_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='cancel-local' THEN RAISE EXCEPTION 'reject cancel audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_campaign_cancel_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_campaign_cancel_commit();`);
    const beforeFailure = await databaseFingerprints(db);
    try {
      await assert.rejects(cancelMockCampaign(p, manager, { ...current, reason: "回滚演练" }), {
        status: 503,
      });
      assert.deepEqual(await databaseFingerprints(db), beforeFailure);
    } finally {
      await db.query(
        "DROP TRIGGER reject_campaign_cancel_commit ON audit_events; DROP FUNCTION reject_campaign_cancel_commit()",
      );
    }
    // Hold the existing lock until cancellation and a real child completion are both waiting.
    const workerName = "cancel-worker-" + key;
    child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: { ...process.env, PGAPPNAME: workerName },
    });
    await once(child, "message", { signal: AbortSignal.timeout(45000) });
    await db.query("BEGIN");
    const lock = await db.query("SELECT pg_advisory_xact_lock(726281),pg_backend_pid() AS pid");
    const cancelling = cancelMockCampaign(p, manager, { ...current, reason: "虚构永久取消" });
    cancelling.catch(() => {});
    let committed = false;
    try {
      const waitFor = async (query: string, args: unknown[]) => {
        for (let i = 0; i < 500; i++) {
          if ((await observer.query(query, args)).rows[0].ready) return;
          await delay(10);
        }
        assert.fail("expected real database wait chain");
      };
      await waitFor(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))) AS ready",
        [lock.rows[0].pid],
      );
      const finished = once(child, "message", { signal: AbortSignal.timeout(45000) });
      child.send({
        actorId: manager.id,
        action: "complete",
        input: { ...pendingTarget, token: pendingLease.token },
      });
      await waitFor(
        `SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity c ON c.datname=w.datname
        WHERE w.application_name=$1 AND c.pid=ANY(pg_blocking_pids(w.pid)) AND $2=ANY(pg_blocking_pids(c.pid))) AS ready`,
        [workerName, lock.rows[0].pid],
      );
      await db.query("COMMIT");
      committed = true;
      const result = await cancelling;
      assert.equal(result.cancelledJobs, 2);
      assert.equal(result.invalidatedLeases, 1);
      assert.equal((await finished)[0].error, 409);
    } finally {
      if (!committed) await db.query("ROLLBACK");
      await cancelling.catch(() => {});
    }
    const cancelledJobs = (
      await p.find({ collection: "subscription-campaign-jobs", pagination: false, depth: 0 })
    ).docs;
    assert.equal(cancelledJobs.filter((j) => j.cancelReason === "campaign-cancelled").length, 2);
    assert.deepEqual(
      await p.findByID({ collection: "subscription-campaign-jobs", id: legacy.id, depth: 0 }),
      oldCancelled,
    );
    assert.deepEqual(
      await p.findByID({
        collection: "subscription-campaign-mock-leases",
        id: doneLease.id,
        depth: 0,
      }),
      completedBefore,
    );
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-budgets", depth: 0 })).docs,
      budgetBefore.docs,
    );
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 })).docs,
      slotsBefore.docs,
    );
    assert.equal((await readCampaignFreeze(p, manager, current))!.counts.en, frozen.counts.en);
    for (const operation of [
      () => freezeCampaignRecipients(p, manager, current),
      () => reserveMockCampaignSlot(p, manager, { ...current, key: randomUUID() }),
      () => claimMockCampaignTask(p, manager, pendingTarget),
      () => completeMockCampaignTask(p, manager, { ...pendingTarget, token: pendingLease.token }),
      () => setCampaignPause(p, manager, { ...current, paused: false, reason: "不可恢复" }),
    ])
      await assert.rejects(operation(), { status: 409 });
    const doneJob = (
      await p.findByID({ collection: "subscription-campaign-mock-slots", id: one.id!, depth: 0 })
    ).job;
    const doneRow = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: Number(doneJob),
      depth: 0,
    });
    await p.update({
      collection: "subscriptions",
      id: Number(doneRow.subscription),
      data: { status: "unsubscribed" },
    });
    const rechecked = await recheckCampaignRecipients(p, manager, current);
    assert.deepEqual(
      await p.findByID({ collection: "subscription-campaign-jobs", id: doneRow.id, depth: 0 }),
      doneRow,
      "later withdrawal must not rewrite a completed task after activity cancellation",
    );
    assert.equal(rechecked.cancelled.campaignCancelled, 2);
    assert.deepEqual(
      (await databaseFingerprints(db)).find((r) => r.table === "subscription_mail_jobs"),
      beforeMail,
    );
    console.log("PASS 本地活动永久取消、权限与终态、历史和额度保留、完成竞争、迁移保护及审计回滚");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      await exit;
    }
    for (const collection of [
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
      await p.delete({ collection, where: {} });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    await observer.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
