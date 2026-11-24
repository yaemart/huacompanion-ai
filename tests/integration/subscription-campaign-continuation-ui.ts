import { assertContinuationUI } from "../helpers/campaign-continuation-ui";
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
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
} from "../../src/server/subscription-campaign-leases";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";
import { relationID } from "../../src/cms/access";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { advanceDispatchClock } from "../helpers/dispatch-clock";

export async function testCampaignContinuationUI(p: Payload, url: URL) {
  const env = { ...process.env },
    key = randomUUID();
  const people: number[] = [],
    subscribers: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const origin = new URL(process.env.APP_URL!).origin;
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构续发入口测试",
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
  const post = (
    token: string,
    input: unknown,
    action = "continue-revision-local",
    patch: Record<string, string> = {},
  ) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin,
          "content-type": "application/json",
          ...patch,
        },
        body: JSON.stringify({ action, input }),
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
      (r) => r.policies.en && r.policies.zh,
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
    const subscribe = async () => {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${subscribers.length}-${key}@example.invalid`,
          topic: "policy-updates",
          locale: "en",
          status: "confirmed",
          consentVersion: 1,
          privacyVersion: key,
          sourcePath: "/en",
          consentedAt: new Date(Date.now() + subscribers.length).toISOString(),
          confirmedAt: new Date().toISOString(),
        },
      });
      subscribers.push(row.id);
    };
    for (let i = 0; i < 3; i++) await subscribe();
    const first = await saveCampaignDraft(p, manager.user, { policies: [choices[0].policies] });
    const original = { campaignKey: first.campaignKey, revision: first.revision };
    await prepare(original);
    const batch = await freezeCampaignRecipients(p, manager.user, original);
    const jobs = (
      await p.find({
        collection: "subscription-campaign-jobs",
        depth: 0,
        pagination: false,
        sort: "id",
        where: { batch: { equals: batch.id } },
      })
    ).docs;
    await setMockCampaignBudget(p, admin.user, { remaining: 2, reason: "虚构原名单占位" });
    const slots: number[] = [];
    for (let i = 0; i < 2; i++) {
      const slot = await reserveMockCampaignSlot(p, manager.user, {
        ...original,
        key: randomUUID(),
      });
      assert.equal(slot.state, "reserved-local");
      slots.push(slot.id!);
    }
    await advanceDispatchClock(p);
    const lease = await claimMockCampaignTask(p, manager.user, { ...original, slotId: slots[0] });
    assert.equal(lease.state, "claimed-local");
    if (lease.state !== "claimed-local") throw Error("fixture claim failed");
    const command = { ...original, slotId: slots[0], token: lease.token };
    await beginMockCampaignAttempt(p, manager.user, command);
    await recordMockCampaignOutcome(p, manager.user, { ...command, outcome: "unknown" });
    await p.update({
      collection: "subscription-campaign-jobs",
      id: jobs[1].id,
      data: {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "ineligible",
      },
    });
    const second = await saveCampaignDraft(p, manager.user, {
      ...original,
      policies: [choices[1].policies],
    });
    const current = { campaignKey: second.campaignKey, revision: second.revision };
    assert.equal(
      (await post(manager.token, { ...current, confirmed: true })).status,
      409,
      "new version needs its own mock confirmation",
    );
    const noReceiptBefore = await databaseFingerprints(db);
    const noReceipt = await post(manager.token, current, "read-continuation-local");
    assert.equal(noReceipt.status, 200);
    assert.equal((await noReceipt.json()).continuation, null);
    assert.deepEqual(await databaseFingerprints(db), noReceiptBefore);
    await prepare(current);
    await subscribe();
    // Target action must exist before trusting the rest of its authorization/selection tests.
    const response = await post(manager.token, { ...current, confirmed: true });
    assert.equal(
      response.status,
      200,
      "confirmed continuation action must be wired to the local service",
    );
    const receipt = (await response.json()).continuation;
    assert.equal(receipt.bound, 1);
    assert.equal(receipt.originalRevision, 1);
    assert.equal(receipt.revision, 2);
    assert.equal(receipt.replayed, false);
    for (const name of ["cache-control", "x-robots-tag", "referrer-policy"])
      assert.ok(response.headers.get(name));
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /@|subscription|job|token|hash|message|body|confirmationId/i,
    );
    await assertContinuationUI(p, manager.user, current, receipt);
    const read = (token = manager.token, input: unknown = current) =>
      post(token, input, "read-continuation-local");
    const before = await databaseFingerprints(db);
    const persisted = await read();
    assert.equal(persisted.status, 200);
    assert.deepEqual((await persisted.json()).continuation, { ...receipt, replayed: true });
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "receipt read never mutates data or audit",
    );
    for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
      for (const action of ["continue-revision-local", "read-continuation-local"])
        assert.equal(
          (
            await post(
              token,
              action.startsWith("read") ? current : { ...current, confirmed: true },
              action,
            )
          ).status,
          403,
        );
    assert.equal((await read(other.token)).status, 404);
    for (const confirmed of [undefined, false, "true", 1])
      assert.equal((await post(manager.token, { ...current, confirmed })).status, 400);
    for (const extra of [
      { force: true },
      { jobs: [jobs[0].id] },
      { revision: 1 },
      { actor: manager.user.id },
    ])
      assert.ok(
        [400, 409].includes(
          (await post(manager.token, { ...current, confirmed: true, ...extra })).status,
        ),
      );
    assert.equal(
      (
        await post(manager.token, { ...current, confirmed: true }, undefined, {
          origin: "https://wrong.invalid",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(manager.token, { ...current, confirmed: true }, undefined, {
          "content-type": "text/plain",
        })
      ).status,
      415,
    );
    assert.equal(
      (await post(manager.token, { ...current, confirmed: true, note: "x".repeat(17000) })).status,
      413,
    );
    assert.equal((await read(manager.token, original)).status, 409);
    assert.equal((await read(manager.token, { ...current, confirmed: true })).status, 400);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => post(manager.token, { ...current, confirmed: true })),
    );
    for (const result of results) {
      assert.equal(result.status, 200);
      assert.equal((await result.json()).continuation.replayed, true);
    }
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "concurrent replay adds neither binding nor audit",
    );
    const oldJobs = jobs.slice(0, 2).map((row) => row.id);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM subscription_campaign_jobs WHERE continuation_draft_id IS NOT NULL",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM subscription_campaign_jobs WHERE id=ANY($1) AND continuation_draft_id IS NOT NULL",
          [oldJobs],
        )
      ).rows[0].n,
      0,
    );
    await setMockCampaignBudget(p, admin.user, { remaining: 1, reason: "原未尝试任务续发占位" });
    const reserved = await post(
      manager.token,
      { ...current, key: randomUUID() },
      "reserve-mock-slot-local",
    );
    assert.equal(reserved.status, 200);
    const slot = (await reserved.json()).reservation;
    assert.equal(slot.state, "reserved-local");
    assert.equal(
      relationID(
        (await p.findByID({ collection: "subscription-campaign-mock-slots", id: slot.id })).job,
      ),
      jobs[2].id,
    );
    await advanceDispatchClock(p);
    const claimed = await post(
      manager.token,
      { ...current, slotId: slot.id },
      "claim-mock-task-local",
    );
    assert.equal(claimed.status, 200);
    assert.equal((await claimed.json()).task.state, "claimed-local");
    await setCampaignPause(p, manager.user, { ...current, paused: true, reason: "核对历史收据" });
    assert.equal((await post(manager.token, { ...current, confirmed: true })).status, 409);
    const pauseBefore = await databaseFingerprints(db);
    assert.equal((await read()).status, 200);
    assert.deepEqual(await databaseFingerprints(db), pauseBefore);
    await setCampaignPause(p, manager.user, { ...current, paused: false, reason: "核对后恢复" });
    const source = (
      await db.query(
        "SELECT id,active_fact_version_id FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
      )
    ).rows;
    await db.query(
      "UPDATE policy_groups SET active_fact_version_id=NULL WHERE active_fact_version_id IS NOT NULL",
    );
    try {
      const changed = await databaseFingerprints(db);
      assert.equal((await read()).status, 200);
      assert.deepEqual(
        await databaseFingerprints(db),
        changed,
        "source-invalid receipt read remains readonly",
      );
      assert.equal((await post(manager.token, { ...current, confirmed: true })).status, 409);
    } finally {
      for (const row of source)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.active_fact_version_id,
          row.id,
        ]);
    }
    await prepare(current);
    await cancelMockCampaign(p, manager.user, { ...current, reason: "结束虚构续发入口验收" });
    assert.equal((await post(manager.token, { ...current, confirmed: true })).status, 409);
    const cancelled = await databaseFingerprints(db);
    assert.equal((await read()).status, 200);
    assert.deepEqual(await databaseFingerprints(db), cancelled);
    process.env.APP_ENV = "trial";
    assert.equal((await read()).status, 403);
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await read()).status, 403);
    console.log(
      "PASS 本地续发后台接口：显式确认、只读收据、权限同源、幂等范围、重开准备领取与历史门禁",
    );
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
