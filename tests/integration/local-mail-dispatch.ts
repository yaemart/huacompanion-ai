import { relationID } from "../../src/cms/access";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import type { Payload } from "payload";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  recordMockCampaignOutcome,
} from "../../src/server/subscription-campaign-leases";
import { readNextCampaignMockSlot } from "../../src/server/subscription-campaign-scheduling";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import { requestVerification } from "../../src/server/customer/service";
import { admitDispatch } from "../../src/server/local-mail-dispatch";
import { runWorkflowJobs } from "../../src/server/workflow/service";
import { setTimeout as delay } from "node:timers/promises";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testLocalMailDispatch(p: Payload, url: URL) {
  const env = { ...process.env };
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const oldCustomerSettings = await p.findGlobal({ slug: "customer-settings" });
  const customerEmail = `customer-${randomUUID()}@example.invalid`;
  const oldSettings = await p.findGlobal({ slug: "workflow-settings" });
  const key = randomUUID(),
    people: number[] = [],
    subscribers: number[] = [];
  let child: ChildProcess | undefined;
  const workflowJobs: number[] = [],
    notifications: number[] = [];
  const originalFetch = globalThis.fetch;
  let resumeTransport: (() => void) | undefined;
  let transportRun: Promise<void> | undefined;
  let slowTrigger = false;
  try {
    const origin = "https://fictional-budget.invalid";
    Object.assign(process.env, {
      APP_ENV: "local",
      APP_URL: origin,
      VISA_CHECKER_ENABLED: "true",
      PRIVACY_VERSION: key,
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fictional-only",
      WORKFLOW_MAIL_FROM: "sender@example.invalid",
    });
    await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    const person = async (role: "admin" | "manager") => {
      const user = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构共用预算",
          email: `${role}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(user.id);
      return user;
    };
    const admin = await person("admin"),
      manager = await person("manager");
    const token = (
      await p.login({ collection: "staff", data: { email: manager.email, password: key } })
    ).token!;
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    const policies = [
      (await readCampaignWorkspace(p, manager)).choices.find((r) => r.policies.zh && r.policies.en)!
        .policies,
    ];
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const test = await campaignMockChecks(p, manager, "test", input);
    await campaignMockChecks(p, manager, "confirm", {
      ...input,
      testId: test.testId,
      readable: ["zh", "en"],
    });
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
    await setMockCampaignBudget(p, admin, { remaining: 10, reason: "虚构预算" });
    const targets: { slotId: number; email: string; subscription: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const slot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      const row = await p.findByID({
        collection: "subscription-campaign-mock-slots",
        id: slot.id!,
        depth: 0,
      });
      const job = await p.findByID({
        collection: "subscription-campaign-jobs",
        id: Number(row.job),
        depth: 0,
      });
      const sub = await p.findByID({
        collection: "subscriptions",
        id: Number(job.subscription),
        depth: 0,
      });
      targets.push({ slotId: slot.id!, email: sub.email, subscription: sub.id });
    }
    const post = (action: string, value: unknown) =>
      POST(
        new Request(origin + "/api/subscriptions/campaigns", {
          method: "POST",
          headers: { authorization: "JWT " + token, origin, "content-type": "application/json" },
          body: JSON.stringify({ action, input: value }),
        }),
      );
    const begin = async (index: number, leaseToken: string) => {
      const response = await post("begin-mock-attempt-local", {
        ...input,
        slotId: targets[index].slotId,
        token: leaseToken,
      });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).task;
    };
    const claim = async (index: number) => {
      const report = await claimMockCampaignTask(p, manager, {
        ...input,
        slotId: targets[index].slotId,
      });
      return report;
    };
    const mail = async (
      email: string,
      offsets: number[],
      status: "sent" | "queued" | "running" = "sent",
      deliverPolicy = false,
    ) => {
      const sub = await p.create({
        collection: "subscriptions",
        data: {
          email,
          topic: `exhibition:${randomUUID()}`,
          locale: "en",
          status: "pending",
          consentVersion: 1,
          consentedAt: new Date().toISOString(),
          privacyVersion: key,
          sourcePath: "/en",
        },
      });
      subscribers.push(sub.id);
      return p.create({
        collection: "subscription-mail-jobs",
        data: {
          key: randomUUID(),
          subscription: sub.id,
          consentVersion: 1,
          siteOrigin: origin,
          status,
          deliverPolicy,
          attemptedAt: offsets.length
            ? offsets.map((ms) => new Date(Date.now() - ms).toISOString())
            : null,
        },
      });
    };
    const ageMail = (id: number, offsets: number[]) =>
      db.query("UPDATE subscription_mail_jobs SET attempted_at=$1::jsonb WHERE id=$2", [
        JSON.stringify(offsets.map((ms) => new Date(Date.now() - ms).toISOString())),
        id,
      ]);
    assert.ok(
      p.collections["local-mail-dispatch"],
      "persistent private dispatch collection is installed",
    );
    await db.query("DELETE FROM local_mail_dispatch");
    const advance = () =>
      db.query(
        "UPDATE local_mail_dispatch SET next_at=clock_timestamp()-interval '1 second' WHERE owner IS NULL",
      );
    for (const user of [undefined, admin, manager])
      await assert.rejects(
        p.find({ collection: "local-mail-dispatch", user, overrideAccess: false }),
        { status: 403 },
      );
    const { up, down } = await import("../../src/migrations/20261122_210000_local_mail_dispatch");
    const adapter = { db: { execute: (sql: string) => db.query(sql) } };
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await down(adapter as never);
      await up(adapter as never);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    // A different customer's transaction lock must not consume the global dispatch mutex.
    await db.query("BEGIN");
    try {
      await db.query("SELECT pg_advisory_xact_lock(726283)");
      assert.equal(
        await p.db.drizzle.transaction(async (tx) =>
          admitDispatch(async (s) => (await tx.execute(s as never)).rows),
        ),
        null,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    await advance();
    const a = await claim(0),
      b = await claim(1);
    if (a.state !== "claimed-local" || b.state !== "claimed-local")
      throw Error("fixture lease missing");
    await db.query(`CREATE FUNCTION slow_dispatch_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END $$;
      CREATE TRIGGER slow_dispatch_insert AFTER INSERT ON local_mail_dispatch
      FOR EACH ROW EXECUTE FUNCTION slow_dispatch_insert();`);
    slowTrigger = true;
    const reports = await Promise.all([begin(0, a.token), begin(1, b.token)]);
    await db.query(
      "DROP TRIGGER slow_dispatch_insert ON local_mail_dispatch; DROP FUNCTION slow_dispatch_insert()",
    );
    slowTrigger = false;
    assert.deepEqual(reports.map((r) => r.state).sort(), [
      "attempting-local",
      "dispatch-wait-local",
    ]);
    const loser = reports[0].state === "dispatch-wait-local" ? 0 : 1;
    assert.equal(reports[loser].attempts, 0);
    const nextGate = (await db.query("SELECT next_at FROM local_mail_dispatch WHERE key='local'"))
      .rows[0].next_at;
    await delay(Math.max(0, new Date(nextGate).getTime() - Date.now() + 2));
    assert.equal((await begin(loser, loser === 0 ? a.token : b.token)).state, "attempting-local");
    const timestamps = (
      await db.query(
        "SELECT attempted_at->>0 AS at FROM subscription_campaign_mock_attempts ORDER BY attempted_at->>0",
      )
    ).rows.map((r) => Date.parse(r.at));
    assert.ok(
      timestamps[1] - timestamps[0] >= 1000,
      "different mailboxes share a real one-second window",
    );
    const beforeReplay = await databaseFingerprints(db);
    assert.equal((await begin(0, a.token)).state, "attempting-local");
    assert.deepEqual(
      await databaseFingerprints(db),
      beforeReplay,
      "replayed begin cannot consume another dispatch slot",
    );
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[0].slotId,
      token: a.token,
      outcome: "permanent",
    });
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[1].slotId,
      token: b.token,
      outcome: "unknown",
    });
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as never), /Preserve/);
    } finally {
      await db.query("ROLLBACK");
    }
    await advance();
    const c = await claim(3);
    if (c.state !== "claimed-local") throw Error("priority fixture lease missing");
    const priority = await mail(targets[2].email, [], "queued");
    const beforePriority = await databaseFingerprints(db);
    const yielded = await begin(3, c.token);
    assert.equal(yielded.state, "dispatch-wait-local");
    assert.equal(yielded.reason, "subscription-priority");
    assert.equal(yielded.attempts, 0);
    assert.deepEqual(await databaseFingerprints(db), beforePriority);
    const selection = await readNextCampaignMockSlot(p, manager, input);
    assert.equal(selection.slotId, null);
    let sends = 0;
    await runSubscriptionMail(p, async () => {
      sends++;
      return { status: "sent" };
    });
    assert.equal(sends, 1);
    assert.equal(
      (await p.findByID({ collection: "subscription-mail-jobs", id: priority.id, depth: 0 }))
        .status,
      "sent",
    );
    assert.equal((await begin(3, c.token)).reason, "rate-limit");
    await advance();
    assert.equal((await begin(3, c.token)).state, "attempting-local");
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[3].slotId,
      token: c.token,
      outcome: "accepted",
    });
    // A future job, withdrawn consent and a mailbox in shared cooldown are not runnable priorities.
    const future = await mail(targets[4].email, [], "queued");
    await db.query(
      "UPDATE subscription_mail_jobs SET next_at=clock_timestamp()+interval '1 hour' WHERE id=$1",
      [future.id],
    );
    const invalid = await mail(targets[4].email, [], "queued");
    await db.query("UPDATE subscriptions SET status='unsubscribed' WHERE id=$1", [
      relationID(invalid.subscription),
    ]);
    const recent = await mail(targets[4].email, [0]);
    const cooling = await mail(targets[4].email, [], "queued");
    await ageMail(recent.id, [0]);
    await advance();
    const d = await claim(5);
    if (d.state !== "claimed-local") throw Error("non-priority fixture lease missing");
    assert.equal((await begin(5, d.token)).state, "attempting-local");
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[5].slotId,
      token: d.token,
      outcome: "accepted",
    });
    await advance();
    const e = await claim(7);
    if (e.state !== "claimed-local") throw Error("inflight fixture lease missing");
    child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: { ...process.env },
    });
    await once(child, "message", { signal: AbortSignal.timeout(45000) });
    await mail(targets[6].email, [], "queued");
    let markStarted!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
      markStarted = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    resumeTransport = release;
    transportRun = runSubscriptionMail(p, async () => {
      markStarted();
      await wait;
      return { status: "sent" };
    });
    await started;
    const reply = once(child, "message", { signal: AbortSignal.timeout(45000) });
    child.send({
      actorId: manager.id,
      action: "begin",
      input: { ...input, slotId: targets[7].slotId, token: e.token },
    });
    const childResult = (await reply)[0] as { error?: number; report: { state: string } };
    assert.equal(childResult.error, undefined);
    assert.equal(childResult.report.state, "dispatch-wait-local");
    release();
    await transportRun;
    child.kill("SIGTERM");
    await once(child, "exit");
    child = undefined;
    await delay(1010);
    assert.equal((await begin(7, e.token)).state, "attempting-local");
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[7].slotId,
      token: e.token,
      outcome: "accepted",
    });
    // Committed in-flight reservation survives a missing worker, and a stale owner cannot send.
    const { withLocalTransport } = await import("../../src/server/local-mail-dispatch");
    const reserve = async (owner: string) =>
      p.db.drizzle.transaction(async (tx) => {
        const query = async (
          statement: Parameters<typeof admitDispatch>[0] extends (s: infer S) => unknown
            ? S
            : never,
        ) => (await tx.execute(statement as never)).rows;
        return admitDispatch(query, owner, 70000);
      });
    await advance();
    assert.equal(await reserve("orphan"), null);
    const f = await claim(8);
    assert.equal(f.state, "dispatch-wait-local");
    await db.query("UPDATE local_mail_dispatch SET next_at=clock_timestamp()-interval '1 second'");
    assert.equal(await reserve("replacement"), null);
    let transports = 0;
    assert.equal(
      (
        await withLocalTransport(p, "orphan", async () => {
          transports++;
          return { status: "sent" };
        })
      ).status,
      "retry",
    );
    assert.equal(transports, 0);
    await withLocalTransport(p, "replacement", async () => {
      transports++;
      return { status: "sent" };
    });
    assert.equal(transports, 1);
    // Marketing audit COMMIT failure rolls back the shared clock as well as its attempt.
    await advance();
    const g = await claim(9);
    if (g.state !== "claimed-local") throw Error("rollback fixture lease missing");
    await db.query(`CREATE FUNCTION reject_dispatch_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='begin-mock-attempt' THEN RAISE EXCEPTION 'reject audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_dispatch_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_dispatch_commit();`);
    try {
      const before = await databaseFingerprints(db);
      assert.equal(
        (
          await post("begin-mock-attempt-local", {
            ...input,
            slotId: targets[9].slotId,
            token: g.token,
          })
        ).status,
        503,
      );
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query(
        "DROP TRIGGER reject_dispatch_commit ON audit_events; DROP FUNCTION reject_dispatch_commit()",
      );
    }
    // Actual notification queue uses the same global gate before increasing attempts.
    await advance();
    const physicalTimes: number[] = [];
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      physicalTimes.push(Date.now());
      return Response.json({ id: randomUUID() });
    };
    for (let i = 0; i < 2; i++) {
      const n = await p.create({
        collection: "workflow-notifications",
        data: { key: randomUUID(), recipient: admin.id, title: "虚构调度通知" },
      });
      notifications.push(n.id);
      const j = await p.create({
        collection: "workflow-mail-jobs",
        data: {
          key: randomUUID(),
          notification: n.id,
          status: "queued",
          nextAt: new Date(Date.now() - 1000).toISOString(),
          attempts: 0,
        },
      });
      workflowJobs.push(j.id);
    }
    await runWorkflowJobs(p);
    const notificationJobs = () =>
      p.find({ collection: "workflow-mail-jobs", depth: 0, where: { id: { in: workflowJobs } } });
    assert.equal((await notificationJobs()).docs.filter((j) => j.attempts === 1).length, 1);
    assert.equal(physicalTimes.length, 1);
    assert.equal((await begin(9, g.token)).state, "dispatch-wait-local");
    await delay(1010);
    await runWorkflowJobs(p);
    assert.equal(physicalTimes.length, 2);
    assert.ok(physicalTimes[1] - physicalTimes[0] >= 1000);
    // Direct verification also shares the gate; waiting remains an indistinguishable no-op.
    await p.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
    let verifications = 0;
    const verificationMail = async () => {
      verifications++;
      return { status: "sent" as const };
    };
    const beforeVerification = await databaseFingerprints(db);
    const blocked = await requestVerification(p, { email: customerEmail }, verificationMail);
    assert.equal(blocked.ok, true);
    assert.equal(verifications, 0);
    assert.deepEqual(await databaseFingerprints(db), beforeVerification);
    await delay(1010);
    const delivered = await requestVerification(p, { email: customerEmail }, verificationMail);
    assert.equal(delivered.ok, true);
    assert.equal(verifications, 1);
    assert.equal((await begin(9, g.token)).state, "dispatch-wait-local");
    await db.query("DELETE FROM subscription_mail_jobs WHERE id=ANY($1::int[])", [
      [future.id, invalid.id, cooling.id],
    ]);
    process.env.APP_ENV = "trial";
    assert.equal(await reserve("nonlocal"), null);
    process.env.APP_ENV = "local";
    console.log("PASS 本地全站每秒限速、订阅优先、跨队列跨进程、在途归属与审计迁移保护");
  } finally {
    if (slowTrigger)
      await db.query(
        "DROP TRIGGER slow_dispatch_insert ON local_mail_dispatch; DROP FUNCTION slow_dispatch_insert()",
      );
    resumeTransport?.();
    if (transportRun) await transportRun.catch(() => {});
    globalThis.fetch = originalFetch;
    await p.delete({ collection: "workflow-mail-jobs", where: { id: { in: workflowJobs } } });
    await p.delete({ collection: "workflow-notifications", where: { id: { in: notifications } } });
    if (p.collections["local-mail-dispatch"]) await db.query("DELETE FROM local_mail_dispatch");
    if (child) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await db.query("DELETE FROM subscription_mail_jobs WHERE subscription_id=ANY($1::int[])", [
      subscribers,
    ]);
    for (const collection of [
      "subscription-campaign-mock-attempts",
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
    await db.query("DELETE FROM subscription_credentials WHERE subscription_id=ANY($1::int[])", [
      subscribers,
    ]);
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await p.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: oldSettings.emailEnabled },
    });
    await p.delete({
      collection: "customer-challenges",
      where: { email: { equals: customerEmail } },
    });
    await p.updateGlobal({
      slug: "customer-settings",
      data: { enabled: oldCustomerSettings.enabled },
    });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
