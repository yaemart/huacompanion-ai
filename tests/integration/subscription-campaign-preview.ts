import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Payload } from "payload";
import pg from "pg";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  readCampaignDraft,
  saveCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { policyMailReference } from "../../src/server/policy-subscription";
import { selectedPolicy, publishFictionalSharedMailPolicy } from "../helpers/policy-email-fixtures";

export async function testCampaignPreview(payload: Payload, url: URL) {
  const key = randomUUID();
  const saved = { ...process.env };
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const people: number[] = [];
  const subscriptionIds: number[] = [];
  const person = async (role: "admin" | "manager" | "operations") => {
    const who = await payload.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: role,
        role,
        active: true,
        email: `${role}-${people.length}-${key}@example.invalid`,
        password: key,
      },
    });
    people.push(who.id);
    return who;
  };
  try {
    Object.assign(process.env, { VISA_CHECKER_ENABLED: "true", PRIVACY_VERSION: key });
    const admin = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    const policy = {
      ...selectedPolicy,
      countryCode: "DE",
      officialSourceUrl: `https://example.invalid/${key}`,
    };
    const group = await publishFictionalSharedMailPolicy(payload, policy, `campaign-${key}`);
    const references = async () => {
      const find = async (locale: "zh" | "en") => {
        const policies = await listPublicPolicies(payload, locale);
        const selected = policies.find((p) => p.officialSourceUrl === policy.officialSourceUrl);
        assert.ok(selected);
        return policyMailReference(locale, selected);
      };
      return { zh: await find("zh"), en: await find("en") };
    };
    const refs = await references();
    const input = { policies: [refs] };
    const jobs = (await payload.count({ collection: "subscription-mail-jobs" })).totalDocs;
    for (const actor of [undefined, admin, manager, operations])
      await assert.rejects(saveCampaignDraft(payload, actor, input), { status: 403 });
    for (const who of [manager, other])
      await setCampaignGrant(payload, admin, {
        staffId: who.id,
        topic: "policy-updates",
        enabled: true,
      });
    for (const bad of [
      null,
      [],
      {},
      { ...input, preview: "forged" },
      { policies: [] },
      { policies: [refs, refs] },
      { policies: [{ zh: "bad" }] },
      { policies: [{ fr: refs.en }] },
      { policies: [{ zh: refs.en }] },
      { policies: Array.from({ length: 11 }, () => refs) },
    ])
      await assert.rejects(saveCampaignDraft(payload, manager, bad), { status: 400 });
    const configurations = [
      { locale: "zh", status: "confirmed", confirmedAt: new Date().toISOString() },
      { locale: "en", status: "confirmed", confirmedAt: new Date().toISOString() },
      { locale: "fr", status: "confirmed", confirmedAt: new Date().toISOString() },
      { locale: "zh", status: "pending" },
      { locale: "zh", status: "unsubscribed" },
      {
        locale: "zh",
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        privacyVersion: "old",
      },
      { locale: "zh", status: "confirmed" },
    ] as const;
    for (const item of configurations) {
      const record = await payload.create({
        collection: "subscriptions",
        data: {
          email: `reader-${subscriptionIds.length}-${key}@example.invalid`,
          topic: "policy-updates",
          consentVersion: 1,
          consentedAt: new Date().toISOString(),
          privacyVersion: key,
          sourcePath: "/en",
          ...item,
        },
      });
      subscriptionIds.push(record.id);
    }
    const first = await saveCampaignDraft(payload, manager, input);
    assert.equal(first.revision, 1);
    assert.equal(first.current, true);
    assert.deepEqual(first.counts, { zh: 1, en: 1, excluded: 1 });
    assert.match(first.preview.zh!.subject, /政策更新/);
    assert.match(first.preview.zh!.body, /30 天/);
    assert.match(first.preview.en!.body, /30 days/);
    assert.match(first.preview.en!.body, /2026-11-01/);
    assert.ok(first.preview.en!.body.includes(policy.officialSourceUrl));
    assert.doesNotMatch(
      JSON.stringify(first),
      /@example.invalid|internalNotes|TEST PRIVATE|owner|verifiedBy|consentVersion/,
    );
    for (const actor of [undefined, admin, operations, { ...operations, role: "manager" }])
      await assert.rejects(readCampaignDraft(payload, actor, first.campaignKey), { status: 403 });
    await assert.rejects(readCampaignDraft(payload, other, first.campaignKey), { status: 404 });
    await assert.rejects(
      saveCampaignDraft(payload, other, { ...input, campaignKey: first.campaignKey, revision: 1 }),
      { status: 404 },
    );
    await assert.rejects(readCampaignDraft(payload, manager, "not-a-uuid"), { status: 400 });
    const changes = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        saveCampaignDraft(payload, manager, {
          campaignKey: first.campaignKey,
          revision: 1,
          policies: [{ zh: refs.zh }],
        }),
      ),
    );
    assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(changes.some((r) => r.status === "rejected" && r.reason.status === 409));
    const second = await readCampaignDraft(payload, manager, first.campaignKey);
    assert.equal(second.revision, 2);
    assert.equal(second.preview.en, null);
    assert.deepEqual(second.counts, { zh: 1, en: 0, excluded: 2 });
    const history = await payload.find({
      collection: "subscription-campaign-drafts",
      where: { campaignKey: { equals: first.campaignKey } },
      sort: "revision",
    });
    assert.equal(history.docs.length, 2);
    assert.deepEqual(history.docs[0].preview, first.preview);
    await payload.update({
      collection: "policy-note-drafts",
      where: { group: { equals: group.group } },
      data: { needsReview: true },
    });
    assert.equal((await readCampaignDraft(payload, manager, first.campaignKey)).current, false);
    await assert.rejects(saveCampaignDraft(payload, manager, { policies: [refs] }), {
      status: 400,
    });
    const refreshed = await saveCampaignDraft(payload, manager, { policies: [await references()] });
    assert.doesNotMatch(refreshed.preview.zh!.body, /FICTIONAL SELECTED POLICY/);
    // Identical facts republished as a new immutable version also invalidate the source binding.
    const originalFact = await payload.findByID({
      collection: "policy-fact-versions",
      id: group.fact,
    });
    const factData = {
      group: group.group,
      sourceRevision: originalFact.sourceRevision,
      approvedBy: originalFact.approvedBy,
      contributors: originalFact.contributors,
      facts: originalFact.facts,
      overrideReason: originalFact.overrideReason,
    };
    const revised = await payload.create({
      collection: "policy-fact-versions",
      data: { ...factData, revision: 2 },
    });
    await payload.update({
      collection: "policy-groups",
      id: group.group,
      data: { activeFactVersion: revised.id },
    });
    assert.equal((await readCampaignDraft(payload, manager, refreshed.campaignKey)).current, false);
    const expired = await payload.create({
      collection: "policy-fact-versions",
      data: {
        ...factData,
        revision: 3,
        facts: { ...(originalFact.facts as Record<string, unknown>), validUntil: "2026-11-02" },
      },
    });
    await payload.update({
      collection: "policy-groups",
      id: group.group,
      data: { activeFactVersion: expired.id },
    });
    assert.equal((await readCampaignDraft(payload, manager, refreshed.campaignKey)).current, false);
    await assert.rejects(saveCampaignDraft(payload, manager, { policies: [await references()] }), {
      status: 400,
    });
    await payload.update({
      collection: "policy-groups",
      id: group.group,
      data: { activeFactVersion: null },
    });
    await assert.rejects(
      saveCampaignDraft(payload, manager, { policies: [await Promise.resolve(refs)] }),
      { status: 400 },
    );
    await payload.update({
      collection: "policy-groups",
      id: group.group,
      data: { activeFactVersion: group.fact },
    });
    // Reject an English selection paired with a different policy's facts.
    const another = (await listPublicPolicies(payload, "en")).find(
      (p) => p.officialSourceUrl !== policy.officialSourceUrl,
    );
    assert.ok(another);
    await assert.rejects(
      saveCampaignDraft(payload, manager, {
        policies: [{ zh: (await references()).zh, en: policyMailReference("en", another) }],
      }),
      { status: 400 },
    );
    await db.query(`CREATE FUNCTION reject_campaign_draft_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-drafts' THEN RAISE EXCEPTION 'fixture rejects draft audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_campaign_draft_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_campaign_draft_commit();`);
    const before = (await payload.count({ collection: "subscription-campaign-drafts" })).totalDocs;
    try {
      await assert.rejects(
        saveCampaignDraft(payload, manager, { policies: [await references()] }),
        { status: 503 },
      );
      assert.equal(
        (await payload.count({ collection: "subscription-campaign-drafts" })).totalDocs,
        before,
      );
    } finally {
      await db.query(
        "DROP TRIGGER reject_campaign_draft_commit ON audit_events; DROP FUNCTION reject_campaign_draft_commit()",
      );
    }
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(726281)");
    await db.query("UPDATE subscription_campaign_grants SET enabled=false WHERE staff_id=$1", [
      manager.id,
    ]);
    const pending = assert.rejects(readCampaignDraft(payload, manager, first.campaignKey), {
      status: 403,
    });
    try {
      let blocked = false;
      for (let n = 0; n < 50; n++) {
        const locks = await db.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=726281 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
        );
        if (locks.rowCount) {
          blocked = true;
          break;
        }
        await setTimeout(20);
      }
      assert.ok(blocked);
    } finally {
      await db.query("COMMIT");
      await pending;
    }
    assert.equal((await payload.count({ collection: "subscription-mail-jobs" })).totalDocs, jobs);
    const audits = await payload.find({
      collection: "audit-events",
      where: { entity: { equals: "subscription-campaign-drafts" } },
    });
    assert.equal(audits.totalDocs, 3);
    assert.doesNotMatch(
      JSON.stringify(audits.docs),
      /reader-|FICTIONAL SELECTED POLICY|TEST PRIVATE/,
    );
    console.log("PASS 群发草稿追加版本、当前授权、双语事实配对、预览人数、来源失效与审计原子性");
  } finally {
    await db.query("ROLLBACK");
    await db.query("DELETE FROM subscription_campaign_drafts WHERE owner_id=ANY($1::int[])", [
      people,
    ]);
    await db.query("DELETE FROM subscription_campaign_grants WHERE staff_id=ANY($1::int[])", [
      people,
    ]);
    await db.query("DELETE FROM subscriptions WHERE id=ANY($1::int[])", [subscriptionIds]);
    await db.query("DELETE FROM staff WHERE id=ANY($1::int[])", [people]);
    await db.end();
    for (const env of Object.keys(process.env)) if (!(env in saved)) delete process.env[env];
    Object.assign(process.env, saved);
  }
}
