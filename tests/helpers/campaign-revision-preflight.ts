import assert from "node:assert/strict";
import type { Payload } from "payload";
import type pg from "pg";
import type { Staff } from "../../src/cms/access";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { reserveMockCampaignSlot } from "../../src/server/subscription-campaign-quota";
import { claimMockCampaignTask } from "../../src/server/subscription-campaign-leases";
import { loadCampaignRevisionPreflight } from "../../src/lib/subscription-campaign-revision-preflight-client";
import { randomUUID } from "node:crypto";
import { databaseFingerprints } from "./database-fingerprints";

export async function assertCampaignRevisionPreflight(
  p: Payload,
  db: pg.Client,
  actor: Staff,
  input: { campaignKey: string; revision: number },
  slots: number[],
  post: (who?: string, value?: unknown) => Promise<Response>,
  subscribers: number[],
) {
  const value = { ...input };
  const read = async () => {
    const before = await databaseFingerprints(db);
    const response = await post(undefined, value);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const result = (await response.json()).preflight;
    const service = await readCampaignRevisionPreflight(p, actor, value);
    assert.deepEqual(result.counts, service.counts);
    assert.deepEqual(result.blockers, service.blockers);
    assert.equal(result.revision, value.revision);
    assert.equal(
      Object.values<number>(result.counts).reduce((a, b) => a + b, 0),
      result.total,
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /@|email|hash|token|subscription|jobId|slotId|subject|body|recordId/i,
    );
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "preflight must not write any table, including checks/audits",
    );
    return result;
  };
  const expected = { attempted: 6, cancelled: 1, ineligible: 0, leased: 1, candidates: 2 };
  const original = await read();
  assert.deepEqual(original.counts, expected);
  assert.deepEqual(original.snapshot, { revision: 1, current: true });
  assert.ok(original.blockers.includes("not-revised"));
  assert.ok(original.blockers.includes("active-lease"));
  assert.ok(!original.blockers.includes("confirmation-required"));
  const mail = process.env.WORKFLOW_MAIL_FROM;
  try {
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    assert.ok((await read()).blockers.includes("confirmation-required"));
  } finally {
    if (mail === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = mail;
  }
  assert.ok(
    !(await read()).blockers.includes("confirmation-required"),
    "a read must not persist a reset",
  );
  // A real persisted reset must still invalidate old confirmation after configuration restoration.
  try {
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await campaignMockChecks(p, actor, "status", value);
  } finally {
    if (mail === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = mail;
  }
  assert.ok((await read()).blockers.includes("confirmation-required"));
  const policies = [
    (await readCampaignWorkspace(p, actor)).choices.find((r) => r.policies.zh && r.policies.en)!
      .policies,
  ];
  value.revision = (await saveCampaignDraft(p, actor, { ...value, policies })).revision;
  const revised = await read();
  assert.deepEqual(revised.snapshot, { revision: 1, current: false });
  assert.deepEqual(revised.counts, expected);
  assert.ok(!revised.blockers.includes("not-revised"));
  assert.ok(
    revised.blockers.includes("confirmation-required"),
    "old version confirmation is never inherited",
  );
  const test = await campaignMockChecks(p, actor, "test", value);
  await campaignMockChecks(p, actor, "confirm", {
    ...value,
    testId: test.testId,
    readable: ["zh", "en"],
  });
  assert.ok(!(await read()).blockers.includes("confirmation-required"));
  const frozenBefore = await databaseFingerprints(db);
  for (const operation of [
    () => freezeCampaignRecipients(p, actor, value),
    () => reserveMockCampaignSlot(p, actor, { ...value, key: randomUUID() }),
  ])
    await assert.rejects(operation(), { status: 409 });
  await assert.rejects(() => claimMockCampaignTask(p, actor, { ...value, slotId: slots[0] }), {
    status: 404,
  });
  assert.deepEqual(
    await databaseFingerprints(db),
    frozenBefore,
    "preflight does not open existing revised execution gates",
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => post(undefined, value);
    assert.deepEqual((await loadCampaignRevisionPreflight(value)).counts, expected);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const job = (
    await db.query(
      "SELECT j.* FROM subscription_campaign_jobs j JOIN subscription_campaign_mock_slots s ON s.job_id=j.id WHERE s.id=$1",
      [slots[0]],
    )
  ).rows[0];
  const live = await p.findByID({ collection: "subscriptions", id: job.subscription_id, depth: 0 });
  const fresh = await p.create({
    collection: "subscriptions",
    data: {
      email: `new-${value.campaignKey}@example.invalid`,
      locale: "en",
      topic: "policy-updates",
      status: "confirmed",
      consentVersion: 1,
      consentedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      privacyVersion: process.env.PRIVACY_VERSION!,
      sourcePath: "/en",
    },
  });
  subscribers.push(fresh.id);
  assert.deepEqual(
    (await read()).counts,
    expected,
    "later subscribers never enter the frozen list",
  );
  for (const patch of [
    { status: "unsubscribed" as const },
    { consentVersion: 2 },
    { email: `changed-${value.campaignKey}@example.invalid` },
    { locale: "zh" as const },
  ]) {
    try {
      await p.update({ collection: "subscriptions", id: live.id, data: patch });
      assert.deepEqual((await read()).counts, { ...expected, ineligible: 1, candidates: 1 });
    } finally {
      await p.update({
        collection: "subscriptions",
        id: live.id,
        data: {
          email: live.email,
          status: live.status,
          consentVersion: live.consentVersion,
          locale: live.locale,
        },
      });
    }
  }
  const lease = (
    await db.query("SELECT * FROM subscription_campaign_mock_leases WHERE slot_id=$1", [slots[1]])
  ).rows[0];
  try {
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",
      [lease.id],
    );
    const expired = await read();
    assert.deepEqual(expired.counts, { ...expected, leased: 0, candidates: 3 });
    assert.ok(!expired.blockers.includes("active-lease"));
    const activeAttempt = (
      await db.query("SELECT * FROM subscription_campaign_mock_leases WHERE slot_id=$1", [slots[2]])
    ).rows[0];
    try {
      await db.query(
        "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()+interval '1 hour' WHERE id=$1",
        [activeAttempt.id],
      );
      const stillRunning = await read();
      assert.equal(stillRunning.counts.attempted, 6);
      assert.equal(stillRunning.counts.candidates, 3);
      assert.ok(
        stillRunning.blockers.includes("active-lease"),
        "an attempted but unfinished live lease still blocks revision",
      );
    } finally {
      await db.query("UPDATE subscription_campaign_mock_leases SET expires_at=$1 WHERE id=$2", [
        activeAttempt.expires_at,
        activeAttempt.id,
      ]);
    }
  } finally {
    await db.query("UPDATE subscription_campaign_mock_leases SET expires_at=$1 WHERE id=$2", [
      lease.expires_at,
      lease.id,
    ]);
  }
  const attempt = (
    await db.query("SELECT * FROM subscription_campaign_mock_attempts WHERE slot_id=$1", [slots[2]])
  ).rows[0];
  try {
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at='[]'::jsonb WHERE id=$1",
      [attempt.id],
    );
    const before = await databaseFingerprints(db);
    assert.equal(
      (await post(undefined, value)).status,
      503,
      "corrupt attempt evidence cannot become a candidate",
    );
    assert.deepEqual(await databaseFingerprints(db), before);
  } finally {
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=$1::jsonb WHERE id=$2",
      [JSON.stringify(attempt.attempted_at), attempt.id],
    );
  }
  return value.revision;
}
