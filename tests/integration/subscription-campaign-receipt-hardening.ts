import { assertReceiptGuidance } from "../helpers/campaign-receipt-guidance";
import { observeCampaignAudience } from "../helpers/campaign-audience-queries";
import { readCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignContinuation } from "../../src/server/subscription-campaign-continuation-read";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload, Where } from "payload";
import pg from "pg";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { resumeMockCampaignRevision } from "../../src/server/subscription-campaign-continuation";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignReceiptHardening(p: Payload, url: URL) {
  const env = { ...process.env },
    key = randomUUID();
  const people: number[] = [],
    subscribers: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构收据校验测试",
        email: `${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password: key,
      },
    });
    people.push(user.id);
    const login = await p.login({
      collection: "staff",
      data: { email: user.email, password: key },
    });
    return { user, token: login.token! };
  };
  const origin = new URL(process.env.APP_URL!).origin;
  const post = (token: string, input: unknown) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: { authorization: "JWT " + token, origin, "content-type": "application/json" },
        body: JSON.stringify({ action: "read-continuation-local", input }),
      }),
    );
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin"),
      manager = await person("manager"),
      other = await person("manager");
    const operations = await person("operations"),
      editor = await person("editor"),
      reviewer = await person("reviewer");
    for (const actor of [manager, other])
      await setCampaignGrant(p, admin.user, {
        staffId: actor.user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const choices = (await readCampaignWorkspace(p, manager.user)).choices.filter(
      (r) => r.policies.zh && r.policies.en,
    );
    assert.ok(choices.length >= 2);
    const prepare = async (input: { campaignKey: string; revision: number }) => {
      const test = await campaignMockChecks(p, manager.user, "test", input);
      await campaignMockChecks(p, manager.user, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    for (let i = 0; i < 3; i++) {
      const sub = await p.create({
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
      subscribers.push(sub.id);
    }
    const observedRead = async (input: { campaignKey: string; revision: number }) => {
      const observed = await observeCampaignAudience(p, () => post(manager.token, input));
      assert.equal(
        observed.statements.length,
        0,
        "reading a receipt must never load the subscriber list",
      );
      return observed.result;
    };
    let lastInput: { campaignKey: string; revision: number } | undefined;
    for (const originalRevision of [2, 1]) {
      let draft = await saveCampaignDraft(p, manager.user, { policies: [choices[0].policies] });
      if (originalRevision === 2)
        draft = await saveCampaignDraft(p, manager.user, {
          campaignKey: draft.campaignKey,
          revision: draft.revision,
          policies: [choices[1].policies],
        });
      // Pass only the service's strict fields, never the full draft report.
      let current = { campaignKey: draft.campaignKey, revision: draft.revision };
      await prepare(current);
      const absentBefore = await databaseFingerprints(db);
      const absent = await observedRead(current);
      assert.equal(absent.status, 200);
      assert.equal((await absent.json()).continuation, null);
      assert.deepEqual(await databaseFingerprints(db), absentBefore);
      await assertReceiptGuidance(p, manager.user, current);
      const batch = await freezeCampaignRecipients(p, manager.user, current);
      const unchanged = await observedRead(current);
      assert.equal(unchanged.status, 200);
      assert.equal((await unchanged.json()).continuation, null);
      await assertReceiptGuidance(p, manager.user, current);
      while (current.revision < 3) {
        const next = await saveCampaignDraft(p, manager.user, {
          ...current,
          policies: [choices[current.revision % 2].policies],
        });
        current = { campaignKey: next.campaignKey, revision: next.revision };
      }
      await prepare(current);
      await assertReceiptGuidance(p, manager.user, current);
      const receipt = await resumeMockCampaignRevision(p, manager.user, current);
      await assertReceiptGuidance(p, manager.user, current);
      assert.equal(receipt.originalRevision, originalRevision);
      const audit = (
        await db.query(
          `SELECT id,"after" FROM audit_events
        WHERE action='continue-local' AND record_id=$1 ORDER BY id DESC LIMIT 1`,
          [String(batch.id)],
        )
      ).rows[0];
      assert.ok(audit);
      const read = () => observedRead(current);
      lastInput = current;
      const validBefore = await databaseFingerprints(db);
      const valid = await read();
      assert.equal(valid.status, 200);
      assert.deepEqual((await valid.json()).continuation, { ...receipt, replayed: true });
      assert.deepEqual(await databaseFingerprints(db), validBefore);
      await db.query(
        `UPDATE audit_events SET "after"=jsonb_set("after",'{originalRevision}',to_jsonb($1::int)) WHERE id=$2`,
        [originalRevision === 2 ? 1 : 2, audit.id],
      );
      try {
        const corrupt = await databaseFingerprints(db);
        const response = await read();
        assert.equal(
          response.status,
          503,
          "receipt must match the actual frozen version, not merely any earlier version",
        );
        assert.deepEqual(
          await databaseFingerprints(db),
          corrupt,
          "rejecting a damaged receipt is readonly",
        );
      } finally {
        await db.query('UPDATE audit_events SET "after"=$1::jsonb WHERE id=$2', [
          JSON.stringify(audit.after),
          audit.id,
        ]);
      }
      assert.equal((await read()).status, 200);
      const original = (
        await db.query("SELECT draft_id FROM subscription_campaign_batches WHERE id=$1", [batch.id])
      ).rows[0].draft_id;
      const old = (
        await db.query(
          "SELECT owner_id,campaign_key FROM subscription_campaign_drafts WHERE id=$1",
          [original],
        )
      ).rows[0];
      for (const patch of [
        { owner_id: other.user.id, campaign_key: current.campaignKey },
        { owner_id: manager.user.id, campaign_key: randomUUID() },
      ]) {
        await db.query(
          "UPDATE subscription_campaign_drafts SET owner_id=$1,campaign_key=$2 WHERE id=$3",
          [patch.owner_id, patch.campaign_key, original],
        );
        try {
          const scopeBefore = await databaseFingerprints(db);
          assert.equal(
            (await read()).status,
            503,
            "the frozen version must belong to this owner and activity",
          );
          assert.deepEqual(await databaseFingerprints(db), scopeBefore);
        } finally {
          await db.query(
            "UPDATE subscription_campaign_drafts SET owner_id=$1,campaign_key=$2 WHERE id=$3",
            [old.owner_id, old.campaign_key, original],
          );
        }
      }
      for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
        assert.equal((await post(token, current)).status, 403);
      assert.equal((await post(other.token, current)).status, 404);
      assert.equal((await post(manager.token, { ...current, revision: 2 })).status, 409);
      assert.equal((await post(manager.token, { ...current, force: true })).status, 400);
      assert.equal((await post(manager.token, { ...current, confirmed: true })).status, 400);
      assert.equal((await read()).status, 200);
    }
    assert.ok(lastInput);
    const reportBefore = await observeCampaignAudience(p, () =>
      readCampaignDraft(p, manager.user, lastInput!.campaignKey),
    );
    assert.equal(reportBefore.statements.length, 1);
    assert.equal(reportBefore.result.counts.en, 3);
    await p.update({
      collection: "subscriptions",
      id: subscribers[0],
      data: { status: "unsubscribed" },
    });
    const reportAfter = await observeCampaignAudience(p, () =>
      readCampaignDraft(p, manager.user, lastInput!.campaignKey),
    );
    assert.equal(reportAfter.statements.length, 1);
    assert.equal(
      reportAfter.result.counts.en,
      2,
      "the existing report must still reread current qualification",
    );
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    const settingsBefore = await databaseFingerprints(db);
    assert.equal((await observedRead(lastInput)).status, 200);
    assert.deepEqual(await databaseFingerprints(db), settingsBefore);
    await p.update({
      collection: "staff",
      user: admin.user,
      id: manager.user.id,
      data: { active: false },
    });
    await assert.rejects(readCampaignContinuation(p, manager.user, lastInput), { status: 403 });
    await p.update({
      collection: "staff",
      user: admin.user,
      id: manager.user.id,
      data: { active: true },
    });
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await post(manager.token, lastInput)).status, 403);
    console.log("PASS 本地续发收据补强：实际冻结版与归属校验、只读拒绝及现职授权保留");
  } finally {
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
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
