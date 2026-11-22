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
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testSubscriptionSharedAttempts(p: Payload, url: URL) {
  const env = { ...process.env };
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const oldSettings = await p.findGlobal({ slug: "workflow-settings" });
  const key = randomUUID(),
    people: number[] = [],
    subscribers: number[] = [];
  let child: ChildProcess | undefined;
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
    for (let i = 0; i < 7; i++) {
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
    await setMockCampaignBudget(p, admin, { remaining: 7, reason: "虚构预算" });
    const targets: { slotId: number; email: string; subscription: number }[] = [];
    for (let i = 0; i < 7; i++) {
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
    let sent = 0;
    const run = () =>
      runSubscriptionMail(p, async () => {
        sent++;
        return { status: "sent" };
      });
    await mail(targets[6].email, [], "queued");
    await run();
    assert.equal(sent, 1, "control confirms the fictional mail adapter is enabled");
    const first = await claim(0);
    if (first.state !== "claimed-local") throw Error("missing fixture lease");
    const history = await mail(targets[0].email, [0]);
    const before = await databaseFingerprints(db);
    const blocked = await begin(0, first.token);
    assert.equal(blocked.state, "cooldown-local");
    assert.equal(blocked.attempts, 0);
    assert.equal(blocked.started, false);
    assert.ok(Date.parse(blocked.nextAttemptAt) > Date.now() + 14 * 60000);
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "waiting cannot consume an attempt or audit",
    );
    assert.equal((await readNextCampaignMockSlot(p, manager, input)).slotId, targets[1].slotId);
    await ageMail(history.id, [15 * 60000 + 1]);
    assert.equal((await begin(0, first.token)).state, "attempting-local");
    const repeatedBefore = await databaseFingerprints(db);
    assert.equal((await begin(0, first.token)).state, "attempting-local");
    assert.deepEqual(
      await databaseFingerprints(db),
      repeatedBefore,
      "unknown begin recovery is idempotent despite own cooldown",
    );
    const queued = await mail(targets[0].email, [], "queued");
    await run();
    assert.equal(sent, 1, "marketing start must block confirmation delivery across topics");
    assert.equal(
      (await p.findByID({ collection: "subscription-mail-jobs", id: queued.id, depth: 0 }))
        .attemptedAt,
      null,
    );
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[0].slotId,
      token: first.token,
      outcome: "unknown",
    });
    await db.query(
      "UPDATE subscription_mail_jobs SET next_at=statement_timestamp()-interval '1 second' WHERE id=$1",
      [queued.id],
    );
    await run();
    assert.equal(sent, 1, "unknown result retains the shared charge");
    const six = await mail(
      targets[1].email,
      [20, 60, 120, 180, 240, 300].map((m) => m * 60000),
      "sent",
      true,
    );
    const limited = await claim(1);
    assert.equal(limited.state, "cooldown-local");
    assert.ok(
      "nextAttemptAt" in limited &&
        Math.abs(Date.parse(limited.nextAttemptAt!) - (Date.now() + 20 * 3600000)) < 3000,
      "wait for fifth newest, not oldest of six",
    );
    await ageMail(
      six.id,
      [20, 60, 120, 180].map((m) => m * 60000).concat([24 * 3600000 + 1, 25 * 3600000]),
    );
    assert.equal(
      (await claim(1)).state,
      "claimed-local",
      "24h boundary has released two older attempts",
    );
    const inFlight = await mail(targets[2].email, [-70000], "running");
    const reserved = await claim(2);
    assert.equal(reserved.state, "cooldown-local");
    assert.ok(
      "nextAttemptAt" in reserved &&
        Date.parse(reserved.nextAttemptAt!) > Date.now() + 15 * 60000 + 60000,
    );
    await db.query("UPDATE subscription_mail_jobs SET status='sent' WHERE id=$1", [inFlight.id]);
    const racing = await claim(3);
    if (racing.state !== "claimed-local") throw Error("missing race lease");
    const raceMail = await mail(targets[3].email, [], "queued");
    child = fork(new URL("../helpers/subscription-mock-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: { ...process.env },
    });
    await once(child, "message", { signal: AbortSignal.timeout(45000) });
    const reply = once(child, "message", { signal: AbortSignal.timeout(45000) });
    const beforeSent = sent;
    child.send({
      actorId: manager.id,
      action: "begin",
      input: { ...input, slotId: targets[3].slotId, token: racing.token },
    });
    const [, values] = await Promise.all([run(), reply]);
    const result = values[0] as { error?: number; report: { state: string } };
    assert.equal(result.error, undefined);
    const mailRow = await p.findByID({
      collection: "subscription-mail-jobs",
      id: raceMail.id,
      depth: 0,
    });
    const marketing = (
      await p.find({
        collection: "subscription-campaign-mock-attempts",
        depth: 0,
        where: { slot: { equals: targets[3].slotId } },
      })
    ).docs;
    assert.equal(
      (Array.isArray(mailRow.attemptedAt) ? mailRow.attemptedAt.length : 0) +
        marketing.reduce((n, r) => n + (r.attemptedAt as string[]).length, 0),
      1,
      "cross-process start versus mail can consume only one shared attempt",
    );
    assert.equal(sent - beforeSent, result.report.state === "cooldown-local" ? 1 : 0);
    child.kill("SIGTERM");
    await once(child, "exit");
    child = undefined;
    const rollback = await claim(4);
    if (rollback.state !== "claimed-local") throw Error("missing rollback lease");
    await db.query(`CREATE FUNCTION reject_shared_budget_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action='begin-mock-attempt' THEN RAISE EXCEPTION 'reject audit'; END IF;
        RETURN NEW;
      END $$;
      CREATE CONSTRAINT TRIGGER reject_shared_budget_commit AFTER INSERT ON audit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_shared_budget_commit();`);
    try {
      const snapshot = await databaseFingerprints(db);
      assert.equal(
        (
          await post("begin-mock-attempt-local", {
            ...input,
            slotId: targets[4].slotId,
            token: rollback.token,
          })
        ).status,
        503,
      );
      assert.deepEqual(await databaseFingerprints(db), snapshot);
    } finally {
      await db.query(
        "DROP TRIGGER reject_shared_budget_commit ON audit_events; DROP FUNCTION reject_shared_budget_commit()",
      );
    }
    const { subscriptionAttemptBudgetSQL } =
      await import("../../src/server/subscription-attempt-budget");
    const query = async (email: string) =>
      (
        await p.db.drizzle.execute(
          subscriptionAttemptBudgetSQL([email]) as unknown as Parameters<
            typeof p.db.drizzle.execute
          >[0],
        )
      ).rows;
    const failed = await claim(5);
    if (failed.state !== "claimed-local") throw Error("missing failed-history lease");
    await begin(5, failed.token);
    await recordMockCampaignOutcome(p, manager, {
      ...input,
      slotId: targets[5].slotId,
      token: failed.token,
      outcome: "permanent",
    });
    await mail(
      targets[5].email,
      [60, 120, 180, 240].map((m) => m * 60000),
    );
    const combined = await query(targets[5].email);
    assert.ok(
      Math.abs(Date.parse(String(combined[0].next)) - (Date.now() + 20 * 3600000)) < 3000,
      "four mail plus one failed marketing exhaust the shared five",
    );
    const finalMail = await mail(targets[5].email, [], "queued");
    const beforeFinalSend = sent;
    await run();
    assert.equal(sent, beforeFinalSend);
    assert.equal(
      (await p.findByID({ collection: "subscription-mail-jobs", id: finalMail.id, depth: 0 }))
        .attemptedAt,
      null,
    );
    await p.update({
      collection: "subscriptions",
      id: targets[0].subscription,
      data: { email: `changed-${key}@example.invalid` },
    });
    assert.equal(
      (await query(`changed-${key}@example.invalid`)).length,
      0,
      "marketing history must not follow a later contact edit",
    );
    assert.equal((await query(targets[0].email)).length, 1);
    process.env.APP_ENV = "trial";
    assert.equal(
      (await query(targets[0].email)).length,
      0,
      "trial cannot include local simulated marketing history",
    );
    process.env.APP_ENV = "local";
    await db.query(
      "UPDATE subscriptions SET email=upper(email) WHERE id=(SELECT subscription_id FROM subscription_mail_jobs WHERE id=$1)",
      [history.id],
    );
    await ageMail(history.id, [0]);
    assert.equal(
      (await query(targets[0].email)).length,
      1,
      "legacy casing shares the normalized mailbox",
    );
    console.log("PASS 本地营销共用邮箱尝试预算、双向冷却、跨进程竞争、边界幂等和审计回滚");
  } finally {
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
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
