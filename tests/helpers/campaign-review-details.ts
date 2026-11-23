import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type pg from "pg";
import type { Staff } from "../../src/cms/access";
import { readCampaignReviewDetails } from "../../src/server/subscription-campaign-review";
import { databaseFingerprints } from "./database-fingerprints";

export async function assertCampaignReviewDetails(
  p: Payload,
  db: pg.Client,
  actor: Staff,
  input: { campaignKey: string; revision: number },
  slots: number[],
) {
  const initial = await readCampaignReviewDetails(p, actor, input);
  assert.equal(initial.total, 4);
  assert.deepEqual(
    initial.rows.map((r) => [r.slotId, r.reason]),
    [
      [slots[2], "interrupted"],
      [slots[3], "window-expired"],
      [slots[4], "attempt-limit"],
      [slots[5], "unknown"],
    ],
  );
  const unknown = initial.rows[3];
  assert.equal(unknown.attemptedAt.length, 1);
  assert.equal(unknown.lastOutcome, "unknown");
  assert.deepEqual(
    unknown.events.map((e) => e.action),
    ["claim-mock-task", "begin-mock-attempt", "outcome-mock-attempt"],
  );
  const createdJobs: number[] = [],
    createdSlots: number[] = [],
    auditIds: number[] = [];
  try {
    const lease = (
      await db.query("SELECT id FROM subscription_campaign_mock_leases WHERE slot_id=$1", [
        slots[5],
      ])
    ).rows[0].id;
    for (let i = 0; i < 22; i++) {
      const audit = await p.create({
        collection: "audit-events",
        data: {
          entity: "subscription-campaign-mock-leases",
          recordId: String(lease),
          actor: Number(actor!.id),
          action: "recover-mock-task",
          after: {
            slotId: slots[5],
            email: "private@example.invalid",
            token: "PRIVATE_TOKEN",
            recipientHash: "PRIVATE_HASH",
            body: "PRIVATE_BODY",
          },
        },
      });
      auditIds.push(audit.id);
    }
    const unrelated = await p.create({
      collection: "audit-events",
      data: {
        entity: "subscription-campaign-mock-leases",
        recordId: "unrelated",
        actor: Number(actor!.id),
        action: "claim-mock-task",
        after: { slotId: slots[5] },
      },
    });
    auditIds.push(unrelated.id);
    for (let i = 0; i < 26; i++) {
      const hash = randomUUID().replaceAll("-", "");
      const job = (
        await db.query(
          `INSERT INTO subscription_campaign_jobs
        (campaign_key,batch_id,subscription_id,consent_version,locale,recipient_hash,status)
        SELECT j.campaign_key,j.batch_id,j.subscription_id,j.consent_version,j.locale,$2,'held'
        FROM subscription_campaign_jobs j JOIN subscription_campaign_mock_slots s ON s.job_id=j.id
        WHERE s.id=$1 RETURNING id`,
          [slots[5], hash],
        )
      ).rows[0].id;
      createdJobs.push(job);
      const slot = (
        await db.query(
          `INSERT INTO subscription_campaign_mock_slots
        (key,job_id,batch_id,budget_id,recipient_hash,reserved_at)
        SELECT $2,$3,batch_id,budget_id,$4,reserved_at FROM subscription_campaign_mock_slots
        WHERE id=$1 RETURNING id`,
          [slots[5], randomUUID(), job, hash],
        )
      ).rows[0].id;
      createdSlots.push(slot);
      await db.query(
        `INSERT INTO subscription_campaign_mock_attempts
        (slot_id,key,message,attempted_at,lease_token_hash,state,last_outcome)
        SELECT $2,$3,message,attempted_at,lease_token_hash,'review',NULL
        FROM subscription_campaign_mock_attempts WHERE slot_id=$1`,
        [slots[5], slot, hash],
      );
    }
    const before = await databaseFingerprints(db);
    const first = await readCampaignReviewDetails(p, actor, { ...input, page: 1 });
    const second = await readCampaignReviewDetails(p, actor, { ...input, page: 2 });
    const empty = await readCampaignReviewDetails(p, actor, { ...input, page: 3 });
    assert.equal(first.total, 30);
    assert.equal(first.rows.length, 25);
    assert.equal(second.rows.length, 5);
    assert.deepEqual(
      [...first.rows, ...second.rows].map((r) => r.slotId),
      [...slots.slice(2, 6), ...createdSlots],
    );
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.total, 30);
    assert.equal(second.rows[0].reason, "unspecified");
    const truncated = first.rows.find((r) => r.slotId === slots[5])!;
    assert.equal(truncated.events.length, 20);
    assert.equal(truncated.hasOlderEvents, true);
    assert.ok(truncated.events.every((e) => e.action === "recover-mock-task"));
    assert.doesNotMatch(
      JSON.stringify(first),
      /@|private_|token|hash|subject|body|subscription|recipient|message|recordId/i,
    );
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "detail pagination never writes any table",
    );
  } finally {
    await db.query("DELETE FROM audit_events WHERE id=ANY($1)", [auditIds]);
    await db.query("DELETE FROM subscription_campaign_mock_attempts WHERE slot_id=ANY($1)", [
      createdSlots,
    ]);
    await db.query("DELETE FROM subscription_campaign_mock_slots WHERE id=ANY($1)", [createdSlots]);
    await db.query("DELETE FROM subscription_campaign_jobs WHERE id=ANY($1)", [createdJobs]);
  }
}
