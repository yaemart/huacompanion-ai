import { advanceDispatchClock } from "../helpers/dispatch-clock";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { Payload } from "payload";
import pg from "pg";
import { relationID } from "../../src/cms/access";
import {
  saveCampaignDraft,
  readCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  reserveMockCampaignSlot,
  setMockCampaignBudget,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
} from "../../src/server/subscription-campaign-leases";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { resumeMockCampaignRevision } from "../../src/server/subscription-campaign-continuation";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignFeedback(p: Payload, url: URL) {
  const module = await import("../../src/server/subscription-campaign-feedback").catch(() => null);
  assert.ok(module?.recordLocalCampaignFeedback, "local delivery feedback service must exist");
  const record = module.recordLocalCampaignFeedback;
  const env = { ...process.env },
    key = randomUUID(),
    people: number[] = [],
    subscribers: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const person = async (role: "admin" | "manager" | "operations") => {
    const row = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构回执",
        email: `${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password: key,
      },
    });
    people.push(row.id);
    return row;
  };
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin"),
      manager = await person("manager"),
      operations = await person("operations");
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    const choices = (await readCampaignWorkspace(p, manager)).choices.filter(
      (r) => r.policies.zh && r.policies.en,
    );
    assert.ok(choices.length >= 2);
    for (let i = 0; i < 2; i++) {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${i}-${key}@example.invalid`,
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
      subscribers.push(row.id);
    }
    const prepare = async (input: { campaignKey: string; revision: number }) => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    const make = async () => {
      const d = await saveCampaignDraft(p, manager, { policies: [choices[0].policies] });
      const input = { campaignKey: d.campaignKey, revision: d.revision };
      await prepare(input);
      await freezeCampaignRecipients(p, manager, input);
      return input;
    };
    const backupAdmin = await person("admin"); // Keep the last-admin guard intact while testing revocation.
    const input = await make();
    const unattempted = await make();
    await setMockCampaignBudget(p, admin, { remaining: 20, reason: "虚构回执额度" });
    const slot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
    assert.equal(slot.state, "reserved-local");
    const target = { ...input, slotId: slot.id! };
    const claimed = await claimMockCampaignTask(p, manager, target);
    assert.equal(claimed.state, "claimed-local");
    if (claimed.state !== "claimed-local") throw Error("missing lease");
    const leased = { ...target, token: claimed.token };
    assert.equal((await beginMockCampaignAttempt(p, manager, leased)).state, "attempting-local");
    await recordMockCampaignOutcome(p, manager, { ...leased, outcome: "accepted" });
    const attempt = (
      await p.find({
        collection: "subscription-campaign-mock-attempts",
        where: { slot: { equals: slot.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0];
    const job = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: relationID(
        (
          await p.findByID({
            collection: "subscription-campaign-mock-slots",
            id: slot.id!,
            depth: 0,
          })
        ).job,
      )!,
      depth: 0,
    });
    const sub = await p.findByID({
      collection: "subscriptions",
      id: relationID(job.subscription)!,
      depth: 0,
    });
    const feedback = {
      eventId: randomUUID(),
      attemptId: attempt.id,
      email: sub.email,
      kind: "hard-bounce",
      occurredAt: new Date().toISOString(),
    };
    const hash = createHash("sha256").update(sub.email).digest("hex");
    const rejection = async (value: unknown, status: number, actor = admin) => {
      const before = await databaseFingerprints(db);
      await assert.rejects(record(p, actor, value), { status });
      assert.deepEqual(await databaseFingerprints(db), before);
    };
    for (const actor of [manager, operations]) await rejection(feedback, 403, actor);
    for (const appEnv of ["trial", "production"]) {
      process.env.APP_ENV = appEnv;
      await rejection(feedback, 403);
    }
    process.env.APP_ENV = "local";
    for (const patch of [
      { force: true },
      { email: null },
      { email: "invalid" },
      { kind: "opened" },
      { attemptId: 0 },
      { email: "real@example.com" },
      { occurredAt: "invalid" },
      { eventId: "not-uuid" },
    ])
      await rejection({ ...feedback, ...patch }, 400);
    await rejection({ ...feedback, email: `wrong-${key}@example.invalid` }, 409);
    await rejection({ ...feedback, attemptId: 2147483647 }, 404);
    await rejection({ ...feedback, occurredAt: "2000-01-01T00:00:00.000Z" }, 400);
    await rejection({ ...feedback, occurredAt: "2099-01-01T00:00:00.000Z" }, 400);
    await p.update({ collection: "staff", user: admin, id: admin.id, data: { active: false } });
    await rejection(feedback, 403);
    await p.update({ collection: "staff", user: admin, id: admin.id, data: { active: true } });
    await record(p, admin, {
      ...feedback,
      eventId: randomUUID(),
      kind: "delivered",
      email: ` ${sub.email.toUpperCase()} `,
    });
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_marketing_suppressions")).rows[0]
        .n,
      0,
      "accepted and delivered do not mean suppression, and ordinary failures in earlier suites did not suppress",
    );
    await p.update({
      collection: "staff",
      user: backupAdmin,
      id: admin.id,
      data: { role: "manager" },
    });
    await rejection(feedback, 403);
    await p.update({
      collection: "staff",
      user: backupAdmin,
      id: admin.id,
      data: { role: "admin" },
    });
    const before = await databaseFingerprints(db);
    const originalCreate = p.create.bind(p);
    p.create = (async (options: Parameters<Payload["create"]>[0]) => {
      if (
        options.collection === "audit-events" &&
        "action" in options.data &&
        options.data.action === "feedback-local"
      )
        throw Error("fictional audit failure");
      return originalCreate(options);
    }) as Payload["create"];
    try {
      await assert.rejects(record(p, admin, feedback), /fictional audit failure/);
    } finally {
      p.create = originalCreate;
    }
    assert.deepEqual(await databaseFingerprints(db), before);
    let signalStored!: () => void, releaseStored!: () => void;
    const stored = new Promise<void>((resolve) => {
      signalStored = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseStored = resolve;
    });
    p.create = (async (options: Parameters<Payload["create"]>[0]) => {
      const result = await originalCreate(options);
      if (
        options.collection === "audit-events" &&
        "action" in options.data &&
        options.data.action === "feedback-local"
      ) {
        signalStored();
        await hold;
      }
      return result;
    }) as Payload["create"];
    const first = record(p, admin, feedback);
    // Surface an early failure rather than waiting forever for an audit signal.
    await Promise.race([
      stored,
      first.then(() => {
        throw Error("missing feedback audit barrier");
      }),
    ]);
    const beginning = beginMockCampaignAttempt(p, manager, leased);
    try {
      let waiting = false;
      for (let i = 0; i < 200; i++) {
        const locks = await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%726271%'",
        );
        if (locks.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "competing operations must actually wait for the feedback transaction");
    } finally {
      releaseStored();
      p.create = originalCreate;
    }
    const receipts = await Promise.all([first, record(p, admin, feedback)]);
    assert.equal(
      (await beginning).state,
      "ineligible",
      "begin rereads suppression after feedback commits",
    );
    assert.deepEqual(receipts.map((r) => r.replayed).sort(), [false, true]);
    const stable = await databaseFingerprints(db);
    assert.equal((await record(p, admin, feedback)).replayed, true);
    assert.deepEqual(await databaseFingerprints(db), stable);
    await rejection({ ...feedback, kind: "delivered" }, 409);
    await rejection(
      { ...feedback, occurredAt: new Date(Date.parse(feedback.occurredAt) + 1).toISOString() },
      409,
    );
    await record(p, admin, { ...feedback, eventId: randomUUID(), kind: "delivered" });
    const suppression = await db.query(
      "SELECT * FROM subscription_marketing_suppressions WHERE recipient_hash=$1",
      [hash],
    );
    assert.equal(suppression.rowCount, 1);
    assert.equal(suppression.rows[0].reason, "hard-bounce");
    assert.deepEqual(
      await p.findByID({
        collection: "subscription-campaign-mock-attempts",
        id: attempt.id,
        depth: 0,
      }),
      attempt,
    );
    assert.deepEqual(await p.findByID({ collection: "subscriptions", id: sub.id, depth: 0 }), sub);
    for (const collection of [
      "subscription-campaign-feedback",
      "subscription-marketing-suppressions",
    ] as const)
      for (const user of [admin, manager, operations]) {
        await assert.rejects(p.find({ collection, user, overrideAccess: false }), { status: 403 });
        await assert.rejects(p.delete({ collection, user, overrideAccess: false, where: {} }), {
          status: 403,
        });
      }
    const snapshot = await databaseFingerprints(db);
    assert.equal((await readCampaignDraft(p, manager, input.campaignKey)).counts.en, 1);
    await readCampaignRevisionPreflight(p, manager, input);
    assert.deepEqual(await databaseFingerprints(db), snapshot);
    assert.equal((await claimMockCampaignTask(p, manager, target)).state, "ineligible");
    const untouchedRevision = await saveCampaignDraft(p, manager, {
      ...unattempted,
      policies: [choices[1].policies],
    });
    const untouchedInput = {
      campaignKey: untouchedRevision.campaignKey,
      revision: untouchedRevision.revision,
    };
    await prepare(untouchedInput);
    const readonlyUnattempted = await databaseFingerprints(db);
    const unattemptedReport = await readCampaignRevisionPreflight(p, manager, untouchedInput);
    assert.equal(unattemptedReport.counts.ineligible, 1);
    assert.equal(unattemptedReport.counts.candidates, 1);
    assert.deepEqual(await databaseFingerprints(db), readonlyUnattempted);
    assert.equal((await resumeMockCampaignRevision(p, manager, untouchedInput)).bound, 1);
    const untouchedJob = (
      await p.find({
        collection: "subscription-campaign-jobs",
        depth: 0,
        limit: 1,
        where: {
          and: [
            { campaignKey: { equals: unattempted.campaignKey } },
            { recipientHash: { equals: hash } },
          ],
        },
      })
    ).docs[0];
    assert.equal(untouchedJob.consentVersion, sub.consentVersion);
    assert.equal(untouchedJob.status, "held");
    assert.equal(untouchedJob.continuationDraft ?? null, null);
    await p.update({ collection: "subscriptions", id: sub.id, data: { status: "unsubscribed" } });
    await p.update({
      collection: "subscriptions",
      id: sub.id,
      data: { status: "confirmed", consentVersion: 2 },
    });
    const newer = await make();
    const jobs = (
      await p.find({
        collection: "subscription-campaign-jobs",
        where: { campaignKey: { equals: newer.campaignKey } },
        pagination: false,
        depth: 0,
      })
    ).docs;
    assert.equal(jobs.length, 1);
    assert.ok(jobs.every((j) => j.recipientHash !== hash));
    const revised = await saveCampaignDraft(p, manager, {
      ...input,
      policies: [choices[1].policies],
    });
    const revision = { campaignKey: revised.campaignKey, revision: revised.revision };
    await prepare(revision);
    const readonlyBefore = await databaseFingerprints(db);
    const report = await readCampaignRevisionPreflight(p, manager, revision);
    assert.equal(report.counts.candidates, 1);
    assert.deepEqual(await databaseFingerprints(db), readonlyBefore);
    assert.equal((await resumeMockCampaignRevision(p, manager, revision)).bound, 1);
    const secondSlot = await reserveMockCampaignSlot(p, manager, {
      ...revision,
      key: randomUUID(),
    });
    assert.equal(secondSlot.state, "reserved-local");
    const secondTarget = { ...revision, slotId: secondSlot.id! };
    const secondClaim = await claimMockCampaignTask(p, manager, secondTarget);
    if (secondClaim.state !== "claimed-local") throw Error("missing second lease");
    const secondLease = { ...secondTarget, token: secondClaim.token };
    await advanceDispatchClock(p);
    assert.equal(
      (await beginMockCampaignAttempt(p, manager, secondLease)).state,
      "attempting-local",
    );

    const secondAttempt = (
      await p.find({
        collection: "subscription-campaign-mock-attempts",
        where: { slot: { equals: secondSlot.id } },
        limit: 1,
        depth: 0,
      })
    ).docs[0];
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_marketing_suppressions")).rows[0]
        .n,
      1,
      "an active attempt alone is not a suppression",
    );
    const secondSub = await p.findByID({
      collection: "subscriptions",
      id: subscribers.find((id) => id !== sub.id)!,
      depth: 0,
    });
    const complaint = {
      eventId: randomUUID(),
      attemptId: secondAttempt.id,
      email: secondSub.email,
      kind: "complaint",
      occurredAt: new Date().toISOString(),
    };
    await record(p, admin, complaint);
    assert.equal((await beginMockCampaignAttempt(p, manager, secondLease)).state, "ineligible");
    assert.equal(
      (await recordMockCampaignOutcome(p, manager, { ...secondLease, outcome: "permanent" })).state,
      "failed-local",
      "an already started attempt must retain its known result after suppression",
    );
    await assert.rejects(
      recordMockCampaignOutcome(p, manager, {
        ...secondLease,
        token: randomUUID(),
        outcome: "permanent",
      }),
      { status: 409 },
    );
    await record(p, admin, { ...complaint, eventId: randomUUID(), kind: "delivered" });
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_marketing_suppressions")).rows[0]
        .n,
      2,
    );
    assert.equal(
      (
        await p.findByID({
          collection: "subscription-campaign-mock-attempts",
          id: secondAttempt.id,
          depth: 0,
        })
      ).state,
      "failed",
    );
    // A historical address must still be matched to the job hash, not the current contact.
    await p.update({
      collection: "subscriptions",
      id: sub.id,
      data: { email: `changed-${key}@example.invalid` },
    });
    await record(p, admin, { ...feedback, eventId: randomUUID(), kind: "complaint" });
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_marketing_suppressions")).rows[0]
        .n,
      2,
    );
    const { down } =
      await import("../../src/migrations/20261125_120000_subscription_campaign_feedback");
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down({ db: { execute: (text: string) => db.query(text) } } as never),
        /Preserve campaign feedback/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    console.log(
      "PASS 本地回执与营销拒发：原任务绑定、重复乱序、权限原子性、重订跨活动拒发和只读边界",
    );
  } finally {
    for (const table of ["subscription_marketing_suppressions", "subscription_campaign_feedback"])
      await db.query(`DELETE FROM ${table}`);
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
      await p.delete({
        collection,
        where: collection === "subscription-campaign-grants" ? { staff: { in: people } } : {},
      });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
