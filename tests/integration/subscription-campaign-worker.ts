import { observeWorkerCompletion } from "../helpers/worker-completion";
import {
  createWorkerResultBarrier,
  waitForWorkerCondition,
  waitForWorkerSessionsGone,
} from "../helpers/worker-result-barrier";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
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
  let rejectTrigger = false;
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
      observeSignal = false,
    ) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          "./tests/helpers/mock-worker-network-guard.mjs",
          ...(observeSignal ? ["--import", "./tests/helpers/mock-worker-signal-observer.mjs"] : []),
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
      child.once("close", () => children.delete(child));
      let stdout = "",
        stderr = "";
      const network: string[] = [];
      const generated: boolean[] = [];
      let signalObserved = false;
      child.stdout!.on("data", (s) => {
        stdout += s;
      });
      child.stderr!.on("data", (s) => {
        stderr += s;
      });
      child.on("message", (m) => {
        if ((m as { workerTestSignal?: string }).workerTestSignal === "SIGTERM")
          signalObserved = true;
        if ((m as { forbiddenGeneration?: boolean }).forbiddenGeneration) generated.push(true);
        if ((m as { forbiddenNetwork?: boolean }).forbiddenNetwork)
          network.push(String((m as { origin?: string }).origin));
      });
      const done = observeWorkerCompletion(
        once(child, "close", { signal: AbortSignal.timeout(45000) }).then(([code, signal]) => {
          assert.deepEqual(
            { network, generated },
            { network: [], generated: [] },
            "worker startup must not connect HMR or generate files",
          );
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
        }),
      );
      return { child, done, output: () => stdout, signalObserved: () => signalObserved };
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
    const forbiddenDrop = await launch("accepted", {
      PAYLOAD_DROP_DATABASE: "true",
      DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
    }).done;
    assert.equal(forbiddenDrop.code, 1);
    assert.match(forbiddenDrop.stderr, /清理|删除/);
    const typesBefore = await readFile("payload-types.ts");
    assert.equal(
      (
        await cli("accepted", {
          NODE_ENV: "development",
          DISABLE_PAYLOAD_HMR: "false",
          PAYLOAD_HMR_URL_OVERRIDE: "ws://forbidden.example.invalid/hmr",
        })
      ).state,
      "idle-local",
    );
    assert.deepEqual(await readFile("payload-types.ts"), typesBefore);
    const absentURL = new URL(url);
    absentURL.pathname = "/hua_subscriptions_" + randomUUID().replaceAll("-", "");
    const absentName = absentURL.pathname.slice(1);
    assert.match(absentName, /^hua_subscriptions_[a-f0-9]{32}$/);
    try {
      assert.equal(
        (await db.query("SELECT 1 FROM pg_database WHERE datname=$1", [absentName])).rowCount,
        0,
      );
      const absent = await launch("accepted", { DATABASE_URL: absentURL.toString() }).done;
      assert.equal(absent.code, 1);
      assert.equal(
        (await db.query("SELECT 1 FROM pg_database WHERE datname=$1", [absentName])).rowCount,
        0,
        "worker must not create a misspelled database",
      );
    } finally {
      if ((await db.query("SELECT 1 FROM pg_database WHERE datname=$1", [absentName])).rowCount)
        await db.query(`DROP DATABASE "${absentName}" WITH (FORCE)`);
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
    const blockAfterClaim = async (slot: number, expire = false, race = false) => {
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
      if (race) {
        const execute = p.db.drizzle.execute;
        let expired = false;
        p.db.drizzle.execute = new Proxy(execute, {
          apply(target, self, args) {
            return Reflect.apply(target, self, args).then(
              async (result: { rows: { active?: boolean }[] }) => {
                if (!expired && result.rows[0]?.active) {
                  expired = true;
                  await db.query(
                    "UPDATE subscription_campaign_mock_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE slot_id=$1",
                    [slot],
                  );
                }
                return result;
              },
            );
          },
        });
        try {
          assert.equal((await tick()).state, "idle-local");
        } finally {
          p.db.drizzle.execute = execute;
        }
        assert.equal((await attempts(slot)).length, 0);
      }
      assert.equal((await tick()).state, "completed-local");
      const current = await p.findByID({
        collection: "subscription-campaign-mock-leases",
        id: old.id,
        depth: 0,
      });
      assert.equal(current.token === old.token, !(expire || race));
      if (!expire && !race)
        assert.equal(current.expiresAt, old.expiresAt, "short wait must not renew lease");
      assert.equal(((await attempts(slot))[0].attemptedAt as string[]).length, 1);
    };
    await blockAfterClaim(waiting);
    await blockAfterClaim(await prepare(), true);
    await blockAfterClaim(await prepare(), false, true);
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
    const audits = async (slot: number) =>
      Object.fromEntries(
        (
          await db.query<{ action: string; n: number }>(
            `
      SELECT action,count(*)::int AS n FROM audit_events WHERE "after"->>'slotId'=$1
      AND action IN ('claim-mock-task','recover-mock-task','begin-mock-attempt','outcome-mock-attempt')
      GROUP BY action`,
            [String(slot)],
          )
        ).rows.map((row) => [row.action, row.n]),
      );
    const workerURL = (applicationName: string) => {
      const connection = new URL(url);
      connection.searchParams.set("application_name", applicationName);
      return connection.toString();
    };
    // Positive PG blocking evidence pins SIGKILL inside the uncommitted result transaction.
    const interrupted = await prepare();
    const killName = `kill-${key}`;
    const killBarrier = await createWorkerResultBarrier(db, interrupted);
    const killed = launch("accepted", { DATABASE_URL: workerURL(killName) });
    try {
      await killBarrier.waitForBlocked(killName, killed.child);
      assert.equal((await attempts(interrupted))[0].state, "attempting");
      assert.equal(((await attempts(interrupted))[0].attemptedAt as string[]).length, 1);
      assert.deepEqual(await audits(interrupted), {
        "claim-mock-task": 1,
        "begin-mock-attempt": 1,
      });
      assert.equal(killed.output().includes('{"state":'), false);
      assert.equal(killed.child.kill("SIGKILL"), true);
      const result = await killed.done;
      assert.equal(result.signal, "SIGKILL");
      assert.equal(result.reports.length, 0);
      await killBarrier.release();
      await waitForWorkerSessionsGone(db, killName);
    } finally {
      if (killed.child.exitCode === null && killed.child.signalCode === null)
        killed.child.kill("SIGKILL");
      await killed.done.catch(() => {});
      await killBarrier.close();
    }
    assert.equal((await attempts(interrupted))[0].state, "attempting");
    assert.equal((await attempts(interrupted))[0].lastOutcome, null);
    assert.equal(((await attempts(interrupted))[0].attemptedAt as string[]).length, 1);
    assert.deepEqual(await audits(interrupted), { "claim-mock-task": 1, "begin-mock-attempt": 1 });
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE slot_id=$1",
      [interrupted],
    );
    before = await databaseFingerprints(db);
    for (const outcome of ["accepted", "unknown"]) {
      assert.equal((await cli(outcome)).state, "idle-local");
      assert.deepEqual(
        await databaseFingerprints(db),
        before,
        "restart must preserve the interrupted attempt and review",
      );
      assert.equal((await readCampaignTaskStatus(p, manager, input)).counts.review, 4);
    }
    // TERM is acknowledged while the current result is still blocked; another slot is ready.
    const graceful = await prepare(),
      next = await prepare();
    const termName = `term-${key}`;
    const termBarrier = await createWorkerResultBarrier(db, graceful);
    const looping = launch("accepted", { DATABASE_URL: workerURL(termName) }, [], true, true);
    try {
      const backend = await termBarrier.waitForBlocked(termName, looping.child);
      assert.equal((await attempts(graceful))[0].state, "attempting");
      assert.equal((await attempts(next)).length, 0);
      assert.equal(looping.output().includes('{"state":'), false);
      assert.equal(looping.child.kill("SIGTERM"), true);
      await waitForWorkerCondition(
        async () => looping.signalObserved(),
        "SIGTERM acknowledgement while processing",
        looping.child,
        10000,
      );
      assert.equal(await termBarrier.waitForBlocked(termName, looping.child), backend);
      assert.deepEqual(await audits(graceful), { "claim-mock-task": 1, "begin-mock-attempt": 1 });
      await termBarrier.release();
      await waitForWorkerCondition(
        async () => {
          const leases = await p.count({
            collection: "subscription-campaign-mock-leases",
            where: { slot: { equals: next } },
          });
          assert.equal(leases.totalDocs, 0, "SIGTERM must not claim the next task");
          return looping.child.exitCode !== null || looping.child.signalCode !== null;
        },
        "SIGTERM must finish its current round and exit",
        undefined,
        10000,
      );
      const result = await looping.done;
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.signal, null);
      assert.equal(result.reports.length, 1);
      assert.equal(result.reports[0].state, "completed-local");
      assert.equal(result.reports[0].slotId, graceful);
      await waitForWorkerSessionsGone(db, termName);
    } finally {
      if (looping.child.exitCode === null && looping.child.signalCode === null)
        looping.child.kill("SIGKILL");
      await looping.done.catch(() => {});
      await termBarrier.close();
    }
    assert.equal((await attempts(graceful))[0].state, "completed");
    assert.equal(((await attempts(graceful))[0].attemptedAt as string[]).length, 1);
    assert.deepEqual(await audits(graceful), {
      "claim-mock-task": 1,
      "begin-mock-attempt": 1,
      "outcome-mock-attempt": 1,
    });
    assert.equal((await attempts(next)).length, 0);
    assert.equal(
      (
        await p.count({
          collection: "subscription-campaign-mock-leases",
          where: { slot: { equals: next } },
        })
      ).totalDocs,
      0,
    );
    assert.deepEqual(await audits(next), {});
    await fresh();
    assert.equal((await cli()).slotId, next, "a new worker may process the untouched next task");
    assert.equal((await attempts(next))[0].state, "completed");
    console.log(
      "PASS 独立本地worker：真实CLI、双进程竞争、五类模拟结果、等待凭证、权限与中断审计保护",
    );
  } finally {
    p.db.commitTransaction = originalCommit;
    const closing = [...children].map((child) => once(child, "close").catch(() => {}));
    for (const child of children) child.kill("SIGKILL");
    await Promise.all(closing);
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
