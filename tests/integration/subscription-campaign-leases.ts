import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import type { Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import { up, down } from "../../src/migrations/20261121_130000_subscription_campaign_mock_leases";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { subscriptionLockKey } from "../../src/server/subscriptions";

export async function testCampaignLeases(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  const children: ChildProcess[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  const collection = "subscription-campaign-mock-leases";
  await db.connect();
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构租约测试",
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
    for (const staff of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: staff.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager);
    const policies = [
      workspace.choices.find((row) => row.policies.zh && row.policies.en)!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const test = await campaignMockChecks(p, manager, "test", input);
    await campaignMockChecks(p, manager, "confirm", {
      ...input,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    for (let i = 0; i < 2; i++)
      await p.create({
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
    await freezeCampaignRecipients(p, manager, input);
    await setMockCampaignBudget(p, admin, { remaining: 2, reason: "虚构租约演练" });
    const slot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
    const target = { ...input, slotId: slot.id! };
    const claim = () => claimMockCampaignTask(p, manager, target);
    const finish = (token: string) => completeMockCampaignTask(p, manager, { ...target, token });
    const count = async () => (await p.count({ collection })).totalDocs;
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
    for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
      await assert.rejects(p.find({ collection, user, overrideAccess: false }), { status: 403 });
      await assert.rejects(
        p.create({ collection, user, overrideAccess: false, data: {} as never }),
        { status: 403 },
      );
    }
    for (const user of [
      undefined,
      admin,
      operations,
      editor,
      reviewer,
      { ...operations, role: "manager" },
    ]) {
      await assert.rejects(claimMockCampaignTask(p, user, target), { status: 403 });
      await assert.rejects(completeMockCampaignTask(p, user, { ...target, token: randomUUID() }), {
        status: 403,
      });
    }
    await assert.rejects(claimMockCampaignTask(p, other, target), { status: 404 });
    await assert.rejects(completeMockCampaignTask(p, other, { ...target, token: randomUUID() }), {
      status: 404,
    });
    for (const invalid of [
      { ...target, slotId: 0 },
      { ...target, slotId: String(slot.id) },
      { ...target, expiresAt: "2099-01-01" },
    ])
      await assert.rejects(claimMockCampaignTask(p, manager, invalid), { status: 400 });
    await assert.rejects(completeMockCampaignTask(p, manager, { ...target, token: "bad" }), {
      status: 400,
    });
    await assert.rejects(claimMockCampaignTask(p, manager, { ...target, slotId: 99999999 }), {
      status: 404,
    });
    const rejectAudit = async () =>
      db.query(`CREATE FUNCTION reject_mock_lease_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('claim-mock-task','recover-mock-task','complete-mock-task') THEN RAISE EXCEPTION 'reject lease audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_mock_lease_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_mock_lease_commit();`);
    const allowAudit = async () =>
      db.query(
        "DROP TRIGGER reject_mock_lease_commit ON audit_events; DROP FUNCTION reject_mock_lease_commit()",
      );
    await rejectAudit();
    try {
      await assert.rejects(claim(), { status: 503 });
      assert.equal(await count(), 0);
    } finally {
      await allowAudit();
    }
    const invoke = async (child: ChildProcess, action: "claim" | "complete", token?: string) => {
      const reply = once(child, "message", { signal: AbortSignal.timeout(45000) });
      child.send({ actorId: manager.id, action, input: token ? { ...target, token } : target });
      const [message] = await reply;
      const value = message as {
        pid: number;
        error?: number;
        report: Awaited<ReturnType<typeof claimMockCampaignTask>>;
      };
      assert.equal(value.error, undefined, "mock child operation failed");
      return value;
    };
    const ready = [];
    for (let i = 0; i < 2; i++) {
      const child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
        env: { ...process.env },
      });
      children.push(child);
      ready.push(once(child, "message", { signal: AbortSignal.timeout(45000) }));
    }
    await Promise.all(ready);
    const results = await Promise.all(children.map((child) => invoke(child, "claim")));
    assert.equal(new Set(results.map((r) => r.pid)).size, 2);
    assert.equal(results.filter((r) => r.report.state === "claimed-local").length, 1);
    assert.equal(results.filter((r) => r.report.state === "busy").length, 1);
    const winner = results.findIndex((r) => r.report.state === "claimed-local");
    const first = results[winner].report;
    assert.equal(first.state, "claimed-local");
    if (first.state !== "claimed-local") throw Error("missing lease");
    assert.doesNotMatch(JSON.stringify(results[1 - winner]), /token|expiresAt|@|recipient/);
    assert.equal(await count(), 1);
    await stop(children[winner]);
    const survivor = children[1 - winner];
    assert.equal((await invoke(survivor, "claim")).report.state, "busy");
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 millisecond'",
    );
    await assert.rejects(finish(first.token), { status: 409 });
    const recovered = (await invoke(survivor, "claim")).report;
    assert.equal(recovered.state, "claimed-local");
    if (recovered.state !== "claimed-local") throw Error("missing recovered lease");
    assert.notEqual(recovered.token, first.token);
    await assert.rejects(finish(first.token), { status: 409 });
    await assert.rejects(finish(randomUUID()), { status: 409 });
    await rejectAudit();
    try {
      await assert.rejects(finish(recovered.token), { status: 503 });
      assert.equal(
        (await p.findByID({ collection, id: recovered.id, depth: 0 })).completedAt,
        null,
      );
    } finally {
      await allowAudit();
    }
    const finished = await Promise.all([
      invoke(survivor, "complete", recovered.token),
      finish(recovered.token),
    ]);
    assert.equal(finished[0].report.state, "completed-local");
    assert.equal(finished[1].state, "completed-local");
    assert.equal((await claim()).state, "completed-local");
    assert.equal((await finish(recovered.token)).state, "completed-local");
    assert.equal(
      (
        await p.count({
          collection: "audit-events",
          where: {
            and: [{ actor: { equals: manager.id } }, { action: { equals: "complete-mock-task" } }],
          },
        })
      ).totalDocs,
      1,
    );
    assert.equal(await count(), 1);
    for (const user of [undefined, admin, manager, other, operations, editor, reviewer]) {
      const scope = { collection, id: recovered.id, user, overrideAccess: false } as const;
      await assert.rejects(p.findByID(scope), { status: 403 });
      await assert.rejects(p.update({ ...scope, data: {} }), { status: 403 });
      await assert.rejects(p.delete(scope), { status: 403 });
    }
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve mock leases/);
    } finally {
      await db.query("ROLLBACK");
    }
    const second = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
    const secondTarget = { ...input, slotId: second.id! };
    const secondLease = await claimMockCampaignTask(p, manager, secondTarget);
    assert.equal(secondLease.state, "claimed-local");
    if (secondLease.state !== "claimed-local") throw Error("missing second lease");
    const secondSlot = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: second.id!,
      depth: 0,
    });
    const secondJob = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: secondSlot.job as number,
      depth: 0,
    });
    const secondFinish = () =>
      completeMockCampaignTask(p, manager, { ...secondTarget, token: secondLease.token });
    for (const data of [{ locale: "zh" as const }, { locale: "en" as const, consentVersion: 2 }]) {
      await p.update({ collection: "subscriptions", id: secondJob.subscription as number, data });
      assert.equal((await secondFinish()).state, "ineligible");
    }
    await p.update({
      collection: "subscriptions",
      id: secondJob.subscription as number,
      data: { locale: "en", consentVersion: 1, status: "confirmed" },
    });
    const subscription = await p.findByID({
      collection: "subscriptions",
      id: secondJob.subscription as number,
      depth: 0,
    });
    await db.query("BEGIN");
    const lock = await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0)),pg_backend_pid() AS pid",
      [subscriptionLockKey(subscription.email, subscription.topic)],
    );
    await db.query(
      "UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=statement_timestamp() WHERE id=$1",
      [subscription.id],
    );
    let settled = false;
    const finishing = secondFinish().then(
      (report) => {
        settled = true;
        return { report, error: undefined };
      },
      (error: unknown) => {
        settled = true;
        return { report: undefined, error };
      },
    );
    let committed = false;
    try {
      let blocked = false;
      for (let i = 0; i < 500 && !settled; i++) {
        blocked = (
          await db.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))) AS blocked",
            [lock.rows[0].pid],
          )
        ).rows[0].blocked;
        if (blocked) break;
        await delay(10);
      }
      assert.ok(settled || blocked, "completion must finish or wait on the subscription lock");
      await db.query("COMMIT");
      committed = true;
      const result = await finishing;
      assert.equal(result.error, undefined);
      assert.equal(
        result.report?.state,
        "ineligible",
        "committed withdrawal must precede completion",
      );
    } finally {
      if (!committed) await db.query("ROLLBACK");
      await finishing;
    }
    assert.equal(
      (await completeMockCampaignTask(p, manager, { ...secondTarget, token: secondLease.token }))
        .state,
      "ineligible",
    );
    assert.equal((await claimMockCampaignTask(p, manager, secondTarget)).state, "ineligible");
    assert.equal(
      (await p.findByID({ collection, id: secondLease.id, depth: 0 })).completedAt,
      null,
    );
    process.env.APP_ENV = "trial";
    await assert.rejects(claim(), { status: 403 });
    await assert.rejects(finish(recovered.token), { status: 403 });
    const audits = await p.find({
      collection: "audit-events",
      depth: 0,
      pagination: false,
      where: { entity: { equals: collection } },
    });
    const auditText = JSON.stringify(audits.docs);
    for (const token of [first.token, recovered.token, secondLease.token])
      assert.ok(!auditText.includes(token), "lease credentials must not enter audit logs");
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(claim(), { status: 403 });
    await assert.rejects(finish(recovered.token), { status: 403 });
    assert.equal((await p.count({ collection: "subscription-campaign-mock-slots" })).totalDocs, 2);
    assert.deepEqual(
      (await databaseFingerprints(db)).find((r) => r.table === "subscription_mail_jobs"),
      mailBefore,
    );
    assert.ok(
      (await p.find({ collection: "subscription-campaign-jobs", pagination: false })).docs.every(
        (job) => job.status === "held",
      ),
    );
    console.log(
      "PASS 本地模拟任务租约：双进程竞争、中断过期恢复、旧凭证拒绝、完成幂等、权限与审计回滚",
    );
  } finally {
    await Promise.all(children.map(stop));
    for (const collection of [
      "subscription-campaign-mock-leases",
      "subscription-campaign-mock-slots",
      "subscription-campaign-mock-budgets",
      "subscription-campaign-jobs",
      "subscription-campaign-batches",
    ] as const)
      await p.delete({ collection, where: {} });
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
    await db.query("DELETE FROM subscriptions WHERE privacy_version=$1", [key]);
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
