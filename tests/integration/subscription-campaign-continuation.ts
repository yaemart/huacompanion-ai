import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { observeWorkerCompletion } from "../helpers/worker-completion";
import { waitForWorkerCondition } from "../helpers/worker-result-barrier";
import { subscriptionLockKey } from "../../src/server/subscriptions";
import type { Payload, Where } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { advanceDispatchClock } from "../helpers/dispatch-clock";
import { relationID } from "../../src/cms/access";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";
import { readCampaignMockSlots } from "../../src/server/subscription-campaign-task-options";
import { readNextCampaignMockSlot } from "../../src/server/subscription-campaign-scheduling";
import { up, down } from "../../src/migrations/20261124_090000_subscription_campaign_continuation";

export async function testCampaignContinuation(p: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  const env = { ...process.env },
    key = randomUUID();
  const people: number[] = [],
    subscribers: number[] = [];
  await db.connect();
  const settings = await p.findGlobal({ slug: "workflow-settings" });
  const children = new Set<ChildProcess>();
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构续发测试",
        email: `${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password: key,
      },
    });
    people.push(user.id);
    return user;
  };
  try {
    const fields = await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='subscription_campaign_jobs'
      AND column_name IN('continuation_draft_id','continuation_confirmation_id','continued_at')`);
    assert.equal(
      fields.rows.length,
      3,
      "local continuation binding must have three nullable fields",
    );
    Object.assign(process.env, {
      APP_URL: "https://fictional-continuation.invalid",
      VISA_CHECKER_ENABLED: "true",
      PRIVACY_VERSION: key,
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fictional-continuation-only",
      WORKFLOW_MAIL_FROM: "sender@example.invalid",
    });
    await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
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
    const choices = (await readCampaignWorkspace(p, manager)).choices.filter(
      (choice) => choice.policies.en && choice.policies.zh,
    );
    assert.ok(choices.length >= 2);
    const prepare = async (input: { campaignKey: string; revision: number }) => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    // Oldest is last in the frozen list and remains a real-domain (therefore non-local) task.
    for (let i = 0; i < 16; i++) {
      const sub = await p.create({
        collection: "subscriptions",
        data: {
          email: i === 0 ? `non-local-${key}@example.com` : `${i}-${key}@example.invalid`,
          topic: "policy-updates",
          locale: "en",
          status: "confirmed",
          consentVersion: 1,
          privacyVersion: key,
          sourcePath: "/en",
          consentedAt: new Date(Date.now() + i).toISOString(),
          confirmedAt: new Date().toISOString(),
        },
      });
      subscribers.push(sub.id);
    }
    const first = await saveCampaignDraft(p, manager, { policies: [choices[0].policies] });
    const original = { campaignKey: first.campaignKey, revision: first.revision };
    await prepare(original);
    const batch = await freezeCampaignRecipients(p, manager, original);
    const jobs = (
      await p.find({
        collection: "subscription-campaign-jobs",
        pagination: false,
        depth: 0,
        sort: "id",
        where: { batch: { equals: batch.id } },
      })
    ).docs;
    assert.equal(jobs.length, 16);
    assert.equal(relationID(jobs[15].subscription), subscribers[0]);
    // Exercise down/up on populated legacy rows, then restore exact old-column fingerprints.
    const template = (await databaseFingerprints(db)).map((row) =>
      row.table === "subscription_campaign_jobs"
        ? {
            ...row,
            columns: row.columns.filter(
              (field) =>
                !["continuation_draft_id", "continuation_confirmation_id", "continued_at"].includes(
                  field,
                ),
            ),
          }
        : row,
    );
    const legacy = await databaseFingerprints(db, template);
    await down(adapter as unknown as MigrateDownArgs);
    await up(adapter as unknown as MigrateUpArgs);
    assert.deepEqual(await databaseFingerprints(db, template), legacy);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM subscription_campaign_jobs WHERE continuation_draft_id IS NOT NULL",
        )
      ).rows[0].n,
      0,
    );
    for (const user of [admin, manager, operations])
      await assert.rejects(
        p.find({ collection: "subscription-campaign-jobs", user, overrideAccess: false }),
        { status: 403 },
      );
    await setMockCampaignBudget(p, admin, { remaining: 10, reason: "虚构续发十项原占位" });
    const slots: number[] = [],
      tokens: string[] = [];
    for (let i = 0; i < 10; i++) {
      const slot = await reserveMockCampaignSlot(p, manager, { ...original, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      slots.push(slot.id!);
      const row = await p.findByID({
        collection: "subscription-campaign-mock-slots",
        id: slot.id!,
        depth: 0,
      });
      assert.equal(relationID(row.job), jobs[i].id);
      if (i === 0 || i === 9) continue;
      await advanceDispatchClock(p);
      const lease = await claimMockCampaignTask(p, manager, { ...original, slotId: slot.id! });
      assert.equal(lease.state, "claimed-local");
      if (lease.state !== "claimed-local") throw Error("fixture claim failed");
      tokens[i] = lease.token;
      if (i < 3) continue;
      const command = { ...original, slotId: slot.id!, token: lease.token };
      if (i === 8) {
        await completeMockCampaignTask(p, manager, command);
        continue;
      }
      await beginMockCampaignAttempt(p, manager, command);
      const outcome = ({ 4: "temporary", 5: "unknown", 6: "permanent", 7: "accepted" } as const)[
        i as 4 | 5 | 6 | 7
      ];
      if (outcome) await recordMockCampaignOutcome(p, manager, { ...command, outcome });
    }
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE slot_id=ANY($1)",
      [[slots[1], slots[3]]],
    );
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()+interval '1 hour' WHERE slot_id=$1",
      [slots[2]],
    );
    await p.update({
      collection: "subscription-campaign-jobs",
      id: jobs[9].id,
      data: {
        status: "cancelled",
        cancelReason: "ineligible",
        cancelledAt: new Date().toISOString(),
      },
    });
    await p.update({
      collection: "subscriptions",
      id: relationID(jobs[10].subscription)!,
      data: { status: "unsubscribed" },
    });
    await p.update({
      collection: "subscriptions",
      id: relationID(jobs[11].subscription)!,
      data: { consentVersion: 2 },
    });
    await p.update({
      collection: "subscriptions",
      id: relationID(jobs[12].subscription)!,
      data: { locale: "zh" },
    });
    await p.update({
      collection: "subscriptions",
      id: relationID(jobs[13].subscription)!,
      data: { email: `changed-${key}@example.invalid` },
    });
    const { resumeMockCampaignRevision } =
      await import("../../src/server/subscription-campaign-continuation");
    const resume = (input: unknown = original, actor = manager) =>
      resumeMockCampaignRevision(p, actor, input);
    await assert.rejects(resume(), { status: 409 });
    const second = await saveCampaignDraft(p, manager, {
      ...original,
      policies: [choices[1].policies],
    });
    const current = { campaignKey: second.campaignKey, revision: second.revision };
    await assert.rejects(resume(current), { status: 409 });
    const test = await campaignMockChecks(p, manager, "test", current);
    await assert.rejects(resume(current), { status: 409 });
    await campaignMockChecks(p, manager, "confirm", {
      ...current,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    for (const actor of [admin, operations, editor, reviewer])
      await assert.rejects(resume(current, actor), { status: 403 });
    await assert.rejects(resume(current, other), { status: 404 });
    for (const input of [
      null,
      {},
      [],
      { ...current, force: true },
      { ...current, jobs: [jobs[3].id] },
      { ...current, confirmed: true },
    ])
      await assert.rejects(resume(input), { status: 400 });
    await assert.rejects(resume(original), { status: 409 });
    process.env.APP_ENV = "trial";
    await assert.rejects(resume(current), { status: 403 });
    process.env.APP_ENV = "local";
    const activeBefore = await databaseFingerprints(db);
    await assert.rejects(resume(current), { status: 409 });
    assert.deepEqual(
      await databaseFingerprints(db),
      activeBefore,
      "active lease prevents every binding change",
    );
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE slot_id=$1",
      [slots[2]],
    );
    const later = await p.create({
      collection: "subscriptions",
      data: {
        email: `later-${key}@example.invalid`,
        topic: "policy-updates",
        locale: "en",
        status: "confirmed",
        consentVersion: 1,
        privacyVersion: key,
        sourcePath: "/en",
        consentedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      },
    });
    subscribers.push(later.id);
    // A pending real admin settings save must invalidate confirmation before selection commits.
    const jobsBeforeSettings = (
      await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")
    ).rows;
    const settingsTransaction = await p.db.beginTransaction();
    assert.ok(settingsTransaction);
    await p.updateGlobal({
      slug: "workflow-settings",
      user: admin,
      req: { transactionID: settingsTransaction },
      data: { emailEnabled: false },
    });
    const contact = await p.findByID({
      collection: "subscriptions",
      id: relationID(jobs[0].subscription)!,
    });
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      subscriptionLockKey(contact.email, contact.topic),
    ]);
    const settingsRace = observeWorkerCompletion(resume(current));
    try {
      await waitForWorkerCondition(
        async () =>
          !!(
            await db.query(`SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0`)
          ).rowCount,
        "continuation waits before the pending settings save commits",
      );
    } finally {
      await p.db.commitTransaction(settingsTransaction);
      await db.query("COMMIT");
    }
    await assert.rejects(settingsRace, { status: 409 });
    assert.deepEqual(
      (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")).rows,
      jobsBeforeSettings,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM audit_events WHERE action='continue-local'"))
        .rows[0].n,
      0,
    );
    await p.updateGlobal({ slug: "workflow-settings", user: admin, data: { emailEnabled: true } });
    await prepare(current);
    const before = await databaseFingerprints(db, template);
    const fullJobs = (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")).rows;
    // A deferred COMMIT failure must roll back both bindings and the receipt, not report success.
    await db.query(`CREATE FUNCTION reject_continuation_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='continue-local' THEN RAISE EXCEPTION 'fictional deferred continuation';
      END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_continuation_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_continuation_commit();`);
    try {
      await assert.rejects(resume(current), { status: 503 });
      assert.deepEqual(await databaseFingerprints(db, template), before);
    } finally {
      await db.query(`DROP TRIGGER reject_continuation_commit ON audit_events;
        DROP FUNCTION reject_continuation_commit()`);
    }
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => resume(current)));
    const receipts = results.map((result) => {
      assert.equal(result.status, "fulfilled", JSON.stringify(result));
      return result.value;
    });
    assert.equal(receipts.filter((row) => !row.replayed).length, 1);
    assert.ok(
      receipts.every((row) => row.bound === 4 && row.originalRevision === 1 && row.revision === 2),
    );
    assert.doesNotMatch(
      JSON.stringify(receipts),
      /@|jobId|subscription|token|hash|message|body|confirmationId/i,
    );
    const secondRow = (
      await p.find({
        collection: "subscription-campaign-drafts",
        depth: 0,
        limit: 1,
        where: {
          and: [{ campaignKey: { equals: current.campaignKey } }, { revision: { equals: 2 } }],
        },
      })
    ).docs[0];
    const bound = (
      await db.query(
        "SELECT id FROM subscription_campaign_jobs WHERE continuation_draft_id=$1 ORDER BY id",
        [secondRow.id],
      )
    ).rows.map((row) => row.id);
    assert.deepEqual(bound, [jobs[0].id, jobs[1].id, jobs[2].id, jobs[14].id]);
    const after = await databaseFingerprints(db, template);
    assert.deepEqual(
      after.filter((row) => !["audit_events", "subscription_campaign_jobs"].includes(row.table)),
      before.filter((row) => !["audit_events", "subscription_campaign_jobs"].includes(row.table)),
    );
    const expectedJobs = await db.query(
      "SELECT * FROM subscription_campaign_jobs WHERE id=ANY($1) ORDER BY id",
      [
        jobs
          .slice(3, 14)
          .concat(jobs[15])
          .map((job) => job.id),
      ],
    );
    assert.deepEqual(
      expectedJobs.rows,
      fullJobs.filter((job) =>
        jobs
          .slice(3, 14)
          .concat(jobs[15])
          .some((row) => row.id === job.id),
      ),
      "attempted/cancelled/ineligible records are byte-for-byte unchanged",
    );
    const replayBefore = await databaseFingerprints(db);
    assert.equal((await resume(current)).replayed, true);
    assert.deepEqual(await databaseFingerprints(db), replayBefore);
    await assert.rejects(
      down(adapter as unknown as MigrateDownArgs),
      /Preserve campaign continuation/,
    );
    assert.deepEqual(
      await readCampaignMockSlots(p, manager, current),
      slots.slice(0, 3),
      "new version lists only rebound original slots",
    );
    // Binding only changes the three new columns and Payload's update timestamp.
    const omitBinding = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([field]) =>
            ![
              "continuation_draft_id",
              "continuation_confirmation_id",
              "continued_at",
              "updated_at",
            ].includes(field),
        ),
      );
    assert.deepEqual(
      (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")).rows.map(
        omitBinding,
      ),
      fullJobs.map(omitBinding),
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM audit_events WHERE action='continue-local'"))
        .rows[0].n,
      1,
    );
    for (const slotId of slots.slice(3))
      await assert.rejects(claimMockCampaignTask(p, manager, { ...current, slotId }), {
        status: 404,
      });
    await assert.rejects(
      beginMockCampaignAttempt(p, manager, {
        ...current,
        slotId: slots[1],
        token: tokens[1],
      }),
      { status: 409 },
    );
    await assert.rejects(claimMockCampaignTask(p, manager, { ...original, slotId: slots[0] }), {
      status: 409,
    });
    const slot0 = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: slots[0],
    });
    assert.deepEqual(await reserveMockCampaignSlot(p, manager, { ...current, key: randomUUID() }), {
      state: "budget-exhausted",
    });
    assert.deepEqual(await reserveMockCampaignSlot(p, manager, { ...current, key: slot0.key }), {
      state: "already-reserved",
      id: slot0.id,
    });
    await setMockCampaignBudget(p, admin, { remaining: 1, reason: "仅给原名单未占位项一份额度" });
    const extra = await reserveMockCampaignSlot(p, manager, { ...current, key: randomUUID() });
    assert.equal(extra.state, "reserved-local");
    assert.equal(
      relationID(
        (await p.findByID({ collection: "subscription-campaign-mock-slots", id: extra.id! })).job,
      ),
      jobs[14].id,
    );
    const attemptRows = async () =>
      (await db.query("SELECT * FROM subscription_campaign_mock_attempts ORDER BY id")).rows;
    const history = await attemptRows();
    await advanceDispatchClock(p);
    // Confirmation/policy attempts share this recipient's 15-minute cooldown and rolling budget.
    const mail = await db.query(
      `INSERT INTO subscription_mail_jobs(key,subscription_id,consent_version,site_origin,status,attempted_at)
      VALUES($1,$2,1,$3,'sent',$4::jsonb) RETURNING id`,
      [
        randomUUID(),
        relationID(jobs[0].subscription),
        process.env.APP_URL,
        JSON.stringify([new Date().toISOString()]),
      ],
    );
    assert.equal(
      (await claimMockCampaignTask(p, manager, { ...current, slotId: slots[0] })).state,
      "cooldown-local",
    );
    await db.query("UPDATE subscription_mail_jobs SET attempted_at=$1::jsonb WHERE id=$2", [
      JSON.stringify(
        Array.from({ length: 5 }, (_, i) =>
          new Date(Date.now() - 3600000 - i * 1000).toISOString(),
        ),
      ),
      mail.rows[0].id,
    ]);
    const exhausted = await claimMockCampaignTask(p, manager, { ...current, slotId: slots[0] });
    assert.equal(exhausted.state, "cooldown-local");
    assert.ok(
      "nextAttemptAt" in exhausted &&
        Date.parse(exhausted.nextAttemptAt!) > Date.now() + 20 * 3600000,
    );
    await db.query("DELETE FROM subscription_mail_jobs WHERE id=$1", [mail.rows[0].id]);
    await db.query(
      "UPDATE local_mail_dispatch SET next_at=clock_timestamp()+interval '1 hour' WHERE owner IS NULL",
    );
    const rate = await claimMockCampaignTask(p, manager, { ...current, slotId: slots[0] });
    assert.equal(rate.state, "dispatch-wait-local");
    assert.ok("reason" in rate && rate.reason === "rate-limit");
    assert.equal((await readNextCampaignMockSlot(p, manager, current)).slotId, null);
    await advanceDispatchClock(p);
    // A currently deliverable confirmation mail takes priority over this rebound marketing task.
    const pending = await p.create({
      collection: "subscriptions",
      data: {
        email: `priority-${key}@example.invalid`,
        topic: "policy-updates",
        locale: "en",
        status: "pending",
        consentVersion: 1,
        privacyVersion: key,
        sourcePath: "/en",
        consentedAt: new Date().toISOString(),
      },
    });
    subscribers.push(pending.id);
    const priority = await db.query(
      `INSERT INTO subscription_mail_jobs(key,subscription_id,consent_version,site_origin)
      VALUES($1,$2,1,$3) RETURNING id`,
      [randomUUID(), pending.id, process.env.APP_URL],
    );
    const wait = await claimMockCampaignTask(p, manager, { ...current, slotId: slots[0] });
    assert.equal(wait.state, "dispatch-wait-local");
    assert.ok("reason" in wait && wait.reason === "subscription-priority");
    assert.equal((await readNextCampaignMockSlot(p, manager, current)).slotId, null);
    assert.deepEqual(await attemptRows(), history, "all waits preserve every attempt row");
    await db.query("DELETE FROM subscription_mail_jobs WHERE id=$1", [priority.rows[0].id]);
    assert.equal((await readNextCampaignMockSlot(p, manager, current)).slotId, slots[0]);
    const lease = await claimMockCampaignTask(p, manager, { ...current, slotId: slots[0] });
    assert.equal(lease.state, "claimed-local");
    if (lease.state !== "claimed-local") throw Error("rebound claim failed");
    const command = { ...current, slotId: slots[0], token: lease.token };
    assert.equal((await beginMockCampaignAttempt(p, manager, command)).state, "attempting-local");
    assert.equal(
      (await recordMockCampaignOutcome(p, manager, { ...command, outcome: "temporary" })).state,
      "retry-local",
    );
    const attempted = (await attemptRows()).find((row) => row.slot_id === slots[0])!;
    const preview = secondRow.preview as { en: { subject: string; body: string } };
    assert.deepEqual(attempted.message, { ...preview.en, locale: "en" });
    assert.equal(attempted.attempted_at.length, 1);
    const third = await saveCampaignDraft(p, manager, {
      ...current,
      policies: [choices[0].policies],
    });
    const latest = { campaignKey: third.campaignKey, revision: third.revision };
    await assert.rejects(resume(latest), { status: 409 });
    await prepare(latest);
    // Deterministically serialize a committed withdrawal with continuation's fresh qualification read.
    await db.query("BEGIN");
    const withdrawal = await p.findByID({
      collection: "subscriptions",
      id: relationID(jobs[14].subscription)!,
    });
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      subscriptionLockKey(withdrawal.email, withdrawal.topic),
    ]);
    await db.query("UPDATE subscriptions SET status='unsubscribed' WHERE id=$1", [withdrawal.id]);
    const racing = observeWorkerCompletion(resume(latest));
    try {
      await waitForWorkerCondition(
        async () =>
          !!(
            await db.query(`SELECT 1 FROM pg_stat_activity
        WHERE datname=current_database() AND pg_backend_pid()=ANY(pg_blocking_pids(pid))`)
          ).rowCount,
        "continuation waits for this withdrawal transaction",
      );
    } finally {
      await db.query("COMMIT");
    }
    assert.equal((await racing).bound, 2);
    assert.deepEqual(await readCampaignMockSlots(p, manager, latest), slots.slice(1, 3));
    await assert.rejects(claimMockCampaignTask(p, manager, { ...latest, slotId: slots[0] }), {
      status: 404,
    });
    assert.deepEqual(
      (await attemptRows()).find((row) => row.slot_id === slots[0]),
      attempted,
      "attempted old-version body, key, retry and timestamps survive another revision",
    );
    // Two real CLI processes use the explicit new revision, each through all existing guards.
    const cli = async () => {
      await advanceDispatchClock(p);
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
          latest.campaignKey,
          "--revision",
          String(latest.revision),
          "--outcome",
          "accepted",
          "--once",
        ],
        { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe", "ipc"] },
      );
      children.add(child);
      let stdout = "",
        stderr = "";
      const forbidden: unknown[] = [];
      child.stdout!.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr!.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("message", (message) => {
        if (
          (message as { forbiddenNetwork?: boolean; forbiddenGeneration?: boolean })
            .forbiddenNetwork ||
          (message as { forbiddenGeneration?: boolean }).forbiddenGeneration
        )
          forbidden.push(message);
      });
      try {
        const [code] = await once(child, "close", { signal: AbortSignal.timeout(45000) });
        assert.equal(code, 0, stderr);
        assert.deepEqual(forbidden, []);
        const reports = stdout
          .split("\n")
          .filter((line) => line.startsWith('{"state":'))
          .map((line) => JSON.parse(line));
        assert.equal(reports.length, 1, stdout);
        assert.equal(reports[0].state, "completed-local");
        assert.doesNotMatch(JSON.stringify(reports), /token|message|@|hash/i);
      } finally {
        if (child.exitCode !== null || child.signalCode !== null) children.delete(child);
      }
    };
    await cli();
    await cli();
    const finalRows = await attemptRows();
    assert.deepEqual(
      finalRows.find((row) => row.slot_id === slots[0]),
      attempted,
    );
    assert.equal(finalRows.length, history.length + 3);
    for (const slot of slots.slice(1, 3)) {
      const row = finalRows.find((item) => item.slot_id === slot)!;
      assert.equal(row.state, "completed");
      assert.equal(row.attempted_at.length, 1);
    }
    await setCampaignPause(p, manager, { ...latest, paused: true, reason: "核对续发" });
    const paused = await databaseFingerprints(db);
    await assert.rejects(resume(latest), { status: 409 });
    assert.deepEqual(await databaseFingerprints(db), paused);
    await setCampaignPause(p, manager, { ...latest, paused: false, reason: "核对后继续" });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(resume(latest), { status: 403 });
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    await assert.rejects(resume(latest), { status: 409 });
    await prepare(latest);
    await p.update({ collection: "staff", id: manager.id, user: admin, data: { active: false } });
    await assert.rejects(resume(latest), { status: 403 });
    await p.update({ collection: "staff", id: manager.id, user: admin, data: { active: true } });
    const fourth = await saveCampaignDraft(p, manager, {
      ...latest,
      policies: [choices[1].policies],
    });
    const noCandidate = { campaignKey: fourth.campaignKey, revision: fourth.revision };
    await prepare(noCandidate);
    const sourceRows = (
      await db.query(
        "SELECT id,active_fact_version_id FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
      )
    ).rows;
    const unchangedJobs = (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id"))
      .rows;
    await db.query(
      "UPDATE policy_groups SET active_fact_version_id=NULL WHERE active_fact_version_id IS NOT NULL",
    );
    try {
      await assert.rejects(resume(noCandidate), { status: 409 });
    } finally {
      for (const row of sourceRows)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.active_fact_version_id,
          row.id,
        ]);
    }
    assert.deepEqual(
      (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")).rows,
      unchangedJobs,
    );
    await prepare(noCandidate);
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    try {
      await assert.rejects(resume(noCandidate), { status: 409 });
    } finally {
      process.env.WORKFLOW_MAIL_FROM = "sender@example.invalid";
    }
    assert.deepEqual(
      (await db.query("SELECT * FROM subscription_campaign_jobs ORDER BY id")).rows,
      unchangedJobs,
    );
    await prepare(noCandidate);
    const zero = await databaseFingerprints(db);
    await assert.rejects(resume(noCandidate), { status: 409 });
    assert.deepEqual(await databaseFingerprints(db), zero);
    await cancelMockCampaign(p, manager, { ...noCandidate, reason: "结束虚构测试" });
    const cancelled = await databaseFingerprints(db);
    await assert.rejects(resume(noCandidate), { status: 409 });
    assert.deepEqual(await databaseFingerprints(db), cancelled);
    console.log(
      "PASS 同活动本地改版续发：原名单未尝试绑定、并发回滚与退订同步、原历史保留、预算调度及新版CLI",
    );
  } finally {
    for (const child of children) {
      const closed = once(child, "close", { signal: AbortSignal.timeout(10000) });
      child.kill("SIGKILL");
      await closed;
    }
    await db.query("ROLLBACK");
    await p.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
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
    ] as const) {
      const where: Where =
        collection === "subscription-campaign-grants" ? { staff: { in: people } } : {};
      await p.delete({ collection, where });
    }
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({
      collection: "subscription-mail-jobs",
      where: { subscription: { in: subscribers } },
    });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
