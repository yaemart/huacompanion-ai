import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import type { Payload } from "payload";
import { relationID } from "../../src/cms/access";
import { readCampaignTaskStatus } from "../../src/server/subscription-campaign-status";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import { advanceDispatchClock } from "../helpers/dispatch-clock";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignWorker(p: Payload, url: URL) {
  const api = await import("../../src/server/subscription-campaign-worker").catch(() => null);
  assert.ok(api?.createMockCampaignWorker, "independent worker orchestration must exist");
  const { createMockCampaignWorker } = api;
  const env = { ...process.env };
  const key = randomUUID();
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const settings = await p.findGlobal({ slug: "workflow-settings" });
  const people: number[] = [],
    subscribers: number[] = [];
  const children = new Set<ChildProcess>();
  let rejectTrigger = false,
    slowResult = false;
  const originalCommit = p.db.commitTransaction.bind(p.db);
  try {
    Object.assign(process.env, {
      APP_URL: "https://fictional-worker.invalid",
      VISA_CHECKER_ENABLED: "true",
      PRIVACY_VERSION: key,
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fictional-worker-only",
      WORKFLOW_MAIL_FROM: "sender@example.invalid",
    });
    await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    const person = async (role: "admin" | "manager" | "operations") => {
      const row = await p.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构独立worker",
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
      other = await person("manager"),
      operations = await person("operations");
    for (const actor of [manager, other])
      await setCampaignGrant(p, admin, {
        staffId: actor.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager);
    const policies = [workspace.choices.find((r) => r.policies.zh && r.policies.en)!.policies];
    const draft = await saveCampaignDraft(p, manager, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const confirm = async () => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    await confirm();
    for (let i = 0; i < 16; i++) {
      const row = await p.create({
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
      subscribers.push(row.id);
    }
    await freezeCampaignRecipients(p, manager, input);
    const options = { ...input, staffId: manager.id };
    const fresh = () => advanceDispatchClock(p);
    const prepare = async () => {
      await fresh();
      const row = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
      assert.equal(row.state, "reserved-local");
      return row.id!;
    };
    const attempts = async (slot: number) =>
      (
        await p.find({
          collection: "subscription-campaign-mock-attempts",
          depth: 0,
          where: { slot: { equals: slot } },
        })
      ).docs;
    const launch = (
      outcome = "accepted",
      patch: Record<string, string | undefined> = {},
      extra: string[] = [],
      loop = false,
    ) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          "./tests/helpers/mock-worker-network-guard.mjs",
          "scripts/subscription-mock-worker.ts",
          "--staff",
          String(manager.id),
          "--campaign",
          input.campaignKey,
          "--revision",
          String(input.revision),
          "--outcome",
          outcome,
          ...(loop ? [] : ["--once"]),
          ...extra,
        ],
        {
          env: { ...process.env, ...patch },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        },
      );
      children.add(child);
      let stdout = "",
        stderr = "",
        network: string[] = [];
      child.stdout!.on("data", (s) => {
        stdout += s;
      });
      child.stderr!.on("data", (s) => {
        stderr += s;
      });
      child.on("message", (m) => {
        if ((m as { forbiddenNetwork?: boolean }).forbiddenNetwork)
          network.push(String((m as { origin?: string }).origin));
      });
      const done = once(child, "exit", { signal: AbortSignal.timeout(45000) }).then(
        ([code, signal]) => {
          children.delete(child);
          assert.deepEqual(network, [], "worker must not call any network transport");
          assert.equal(
            /@example\.invalid|leaseTokenHash|"token"/.test(stdout + stderr),
            false,
            "worker logs must not expose contacts or credentials",
          );
          const reports = stdout
            .split("\n")
            .filter((s) => s.startsWith('{"state":'))
            .map((s) => JSON.parse(s));
          assert.equal(
            /token|example.invalid|leaseTokenHash|message/i.test(JSON.stringify(reports)),
            false,
            "logs expose safe receipts only",
          );
          return { code, signal, reports, stdout, stderr };
        },
      );
      return { child, done, output: () => stdout };
    };
    const cli = async (
      outcome = "accepted",
      patch: Record<string, string | undefined> = {},
      extra: string[] = [],
    ) => {
      const result = await launch(outcome, patch, extra).done;
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.reports.length, 1);
      return result.reports[0];
    };
    // Strict mode and arguments fail with an unusable DB, without creating any fixtures.
    for (const patch of [{ APP_ENV: "production" }, { APP_ENV: "trial" }, {}]) {
      const result = await launch(
        "accepted",
        {
          ...patch,
          DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
          PAYLOAD_SECRET: "fictional-unused-secret-00000000000000000000",
        },
        patch.APP_ENV ? [] : ["--all"],
      ).done;
      assert.equal(result.code, 1);
      assert.match(result.stderr, /本地模拟|有效主管/);
      assert.equal(/ECONNREFUSED|postgres|unused-secret/.test(result.stderr), false);
    }
    const emptyBefore = await databaseFingerprints(db);
    assert.equal((await createMockCampaignWorker(p, options)()).state, "idle-local");
    assert.deepEqual(
      await databaseFingerprints(db),
      emptyBefore,
      "worker cannot prepare its own budget or slots",
    );
    await setMockCampaignBudget(p, admin, { remaining: 16, reason: "虚构worker预算" });
    const first = await prepare();
    const racers = await Promise.all([cli(), cli()]);
    assert.equal(racers.filter((r) => r.state === "completed-local").length, 1);
    assert.equal((await attempts(first))[0].state, "completed");
    assert.equal(((await attempts(first))[0].attemptedAt as string[]).length, 1);
    assert.equal(
      (
        await p.find({
          collection: "audit-events",
          where: { action: { equals: "begin-mock-attempt" }, actor: { equals: manager.id } },
        })
      ).totalDocs,
      1,
    );
    // An explicit temporary result is retried only when BOTH old cooldown and backoff permit it.
    const temporary = await prepare();
    assert.equal((await cli("temporary")).state, "retry-local");
    const temporaryRow = (await attempts(temporary))[0];
    assert.ok(
      Date.parse(temporaryRow.nextAttemptAt!) >=
        Date.parse((temporaryRow.attemptedAt as string[])[0]) + 900000,
    );
    const cooledBefore = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(await databaseFingerprints(db), cooledBefore);
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=$1::jsonb,next_attempt_at=clock_timestamp()-interval '1 second' WHERE slot_id=$2",
      [JSON.stringify([new Date(Date.now() - 960000).toISOString()]), temporary],
    );
    await fresh();
    assert.equal((await cli()).state, "completed-local");
    assert.equal(((await attempts(temporary))[0].attemptedAt as string[]).length, 2);
    for (const [outcome, state] of [
      ["rate-limited", "retry-local"],
      ["unknown", "review-local"],
      ["permanent", "failed-local"],
    ]) {
      const slot = await prepare();
      const result = await cli(
        outcome,
        {},
        outcome === "rate-limited" ? ["--retry-after-ms", "120000"] : [],
      );
      assert.equal(result.state, state);
      assert.equal(result.attempts, 1);
      assert.equal((await attempts(slot))[0].lastOutcome, outcome);
    }
    // A controlled global hold and runnable confirmation both yield without DB writes.
    const withdrawn = await prepare();
    const withdrawnSlot = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: withdrawn,
      depth: 0,
    });
    const withdrawnJob = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: relationID(withdrawnSlot.job)!,
      depth: 0,
    });
    await p.update({
      collection: "subscriptions",
      id: relationID(withdrawnJob.subscription)!,
      data: { status: "unsubscribed", unsubscribedAt: new Date().toISOString() },
    });
    const withdrawnBefore = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.equal((await attempts(withdrawn)).length, 0);
    assert.deepEqual(await databaseFingerprints(db), withdrawnBefore);
    const waiting = await prepare();
    await db.query(
      "UPDATE local_mail_dispatch SET next_at=clock_timestamp()+interval '30 seconds' WHERE owner IS NULL",
    );
    let before = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(await databaseFingerprints(db), before);
    await fresh();
    const prioritySub = await p.create({
      collection: "subscriptions",
      data: {
        email: `priority-${key}@example.invalid`,
        topic: "policy-updates",
        locale: "en",
        status: "pending",
        consentVersion: 1,
        consentedAt: new Date().toISOString(),
        privacyVersion: key,
        sourcePath: "/en",
      },
    });
    subscribers.push(prioritySub.id);
    const priority = await p.create({
      collection: "subscription-mail-jobs",
      data: {
        key: randomUUID(),
        subscription: prioritySub.id,
        deliverPolicy: false,
        consentVersion: 1,
        siteOrigin: process.env.APP_URL!,
        status: "queued",
      },
    });
    before = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "worker cannot consume priority mail or mutate wait state",
    );
    await p.update({
      collection: "subscription-mail-jobs",
      id: priority.id,
      data: { status: "cancelled" },
    });
    // Inject contention AFTER claim commits. Repeated ticks keep the SAME original lease.
    const blockAfterClaim = async (slot: number, expire = false) => {
      const tick = createMockCampaignWorker(p, options);
      let injected = false;
      p.db.commitTransaction = async (id) => {
        await originalCommit(id);
        if (
          !injected &&
          (
            await db.query("SELECT id FROM subscription_campaign_mock_leases WHERE slot_id=$1", [
              slot,
            ])
          ).rowCount
        ) {
          injected = true;
          await db.query(
            "UPDATE local_mail_dispatch SET next_at=clock_timestamp()+interval '70 seconds' WHERE owner IS NULL",
          );
        }
      };
      try {
        assert.equal((await tick()).state, "dispatch-wait-local");
      } finally {
        p.db.commitTransaction = originalCommit;
      }
      assert.equal((await attempts(slot)).length, 0);
      const old = (
        await p.find({
          collection: "subscription-campaign-mock-leases",
          depth: 0,
          where: { slot: { equals: slot } },
        })
      ).docs[0];
      if (expire)
        await db.query(
          "UPDATE subscription_campaign_mock_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE slot_id=$1",
          [slot],
        );
      await fresh();
      assert.equal((await tick()).state, "completed-local");
      const current = await p.findByID({
        collection: "subscription-campaign-mock-leases",
        id: old.id,
        depth: 0,
      });
      assert.equal(current.token === old.token, !expire);
      if (!expire)
        assert.equal(current.expiresAt, old.expiresAt, "short wait must not renew lease");
      assert.equal(((await attempts(slot))[0].attemptedAt as string[]).length, 1);
    };
    await blockAfterClaim(waiting);
    await blockAfterClaim(await prepare(), true);
    // Worker still goes through old authorization, pause and current-version gates.
    await setCampaignPause(p, manager, { ...input, paused: true, reason: "虚构暂停" });
    before = await databaseFingerprints(db);
    await assert.rejects(createMockCampaignWorker(p, options)(), { status: 409 });
    assert.deepEqual(await databaseFingerprints(db), before);
    await setCampaignPause(p, manager, { ...input, paused: false, reason: "虚构恢复" });
    for (const staffId of [admin.id, other.id, operations.id]) {
      before = await databaseFingerprints(db);
      await assert.rejects(createMockCampaignWorker(p, { ...options, staffId })(), {
        status: staffId === other.id ? 404 : 403,
      });
      assert.deepEqual(await databaseFingerprints(db), before);
    }
    await assert.rejects(
      createMockCampaignWorker(p, { ...options, revision: input.revision + 1 })(),
      { status: 409 },
    );
    // Revoke between begin and result: no result is forged, and the failed instance stays stopped.
    const revoked = await prepare();
    const tick = createMockCampaignWorker(p, options);
    let revokedNow = false;
    p.db.commitTransaction = async (id) => {
      await originalCommit(id);
      if (
        !revokedNow &&
        (
          await db.query("SELECT id FROM subscription_campaign_mock_attempts WHERE slot_id=$1", [
            revoked,
          ])
        ).rowCount
      ) {
        revokedNow = true;
        await setCampaignGrant(p, admin, {
          staffId: manager.id,
          topic: "policy-updates",
          enabled: false,
        });
      }
    };
    try {
      await assert.rejects(tick(), { status: 403 });
    } finally {
      p.db.commitTransaction = originalCommit;
    }
    assert.equal((await attempts(revoked))[0].state, "attempting");
    assert.equal((await attempts(revoked))[0].lastOutcome, null);
    before = await databaseFingerprints(db);
    await assert.rejects(tick());
    assert.deepEqual(await databaseFingerprints(db), before);
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    await confirm();
    // Actual CLI COMMIT failure exits nonzero; restart never adopts the in-progress attempt.
    const failed = await prepare();
    await db.query(`CREATE FUNCTION reject_worker_result() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='outcome-mock-attempt' THEN RAISE EXCEPTION 'fictional result commit failure'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_worker_result AFTER INSERT ON audit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_worker_result();`);
    rejectTrigger = true;
    assert.equal((await launch().done).code, 1);
    await db.query(
      "DROP TRIGGER reject_worker_result ON audit_events; DROP FUNCTION reject_worker_result()",
    );
    rejectTrigger = false;
    assert.equal((await attempts(failed))[0].state, "attempting");
    assert.equal(((await attempts(failed))[0].attemptedAt as string[]).length, 1);
    before = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(await databaseFingerprints(db), before);
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE slot_id=ANY($1::int[])",
      [[revoked, failed]],
    );
    before = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "expired begun tasks cannot be cleared by restart",
    );
    // A real SIGKILL after begin rolls back the pending result; restart cannot adopt it.
    const interrupted = await prepare();
    await db.query(`CREATE FUNCTION slow_worker_result() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='outcome-mock-attempt' THEN PERFORM pg_sleep(2); END IF; RETURN NEW; END $$;
      CREATE TRIGGER slow_worker_result BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION slow_worker_result();`);
    slowResult = true;
    const killed = launch();
    const killDeadline = Date.now() + 30000;
    while (!(await attempts(interrupted)).length && Date.now() < killDeadline) await delay(25);
    assert.equal((await attempts(interrupted)).length, 1);
    killed.child.kill("SIGKILL");
    assert.equal((await killed.done).signal, "SIGKILL");
    await delay(2200);
    await db.query(
      "DROP TRIGGER slow_worker_result ON audit_events; DROP FUNCTION slow_worker_result()",
    );
    slowResult = false;
    assert.equal((await attempts(interrupted))[0].state, "attempting");
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE slot_id=$1",
      [interrupted],
    );
    before = await databaseFingerprints(db);
    assert.equal((await cli()).state, "idle-local");
    assert.deepEqual(await databaseFingerprints(db), before);
    assert.equal((await readCampaignTaskStatus(p, manager, input)).counts.review, 4);
    // Graceful TERM completes its current round and stops further polling.
    const graceful = await prepare();
    const looping = launch("accepted", {}, [], true);
    const deadline = Date.now() + 30000;
    while (!looping.output().includes('{"state":') && Date.now() < deadline) await delay(25);
    assert.ok(looping.output().includes('{"state":'));
    looping.child.kill("SIGTERM");
    assert.equal((await looping.done).code, 0);
    assert.equal((await attempts(graceful))[0].state, "completed");
    console.log(
      "PASS 独立本地worker：真实CLI、双进程竞争、五类模拟结果、等待凭证、权限与中断审计保护",
    );
  } finally {
    p.db.commitTransaction = originalCommit;
    for (const child of children) child.kill("SIGKILL");
    for (const child of children) await once(child, "exit").catch(() => {});
    if (slowResult)
      await db.query(
        "DROP TRIGGER slow_worker_result ON audit_events; DROP FUNCTION slow_worker_result()",
      );
    if (rejectTrigger)
      await db.query(
        "DROP TRIGGER reject_worker_result ON audit_events; DROP FUNCTION reject_worker_result()",
      );
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
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await p.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
