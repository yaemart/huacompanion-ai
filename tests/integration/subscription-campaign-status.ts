import { advanceDispatchClock } from "../helpers/dispatch-clock";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { readCampaignTaskStatus } from "../../src/server/subscription-campaign-status";
import {
  readCampaignDraft,
  saveCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  beginMockCampaignAttempt,
  claimMockCampaignTask,
  recordMockCampaignOutcome,
} from "../../src/server/subscription-campaign-leases";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { assertCampaignReviewDetails } from "../helpers/campaign-review-details";
import { readCampaignReviewDetails } from "../../src/server/subscription-campaign-review";
import { loadCampaignReviewDetails } from "../../src/lib/subscription-campaign-review-client";
import { assertCampaignRevisionPreflight } from "../helpers/campaign-revision-preflight";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { observeCampaignAudience } from "../helpers/campaign-audience-queries";

export async function testCampaignStatus(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  const subscribers: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const origin = new URL(process.env.APP_URL!).origin;
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构状态测试",
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
    patch: { origin?: string; type?: string; raw?: string; action?: string } = {},
  ) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin: patch.origin ?? origin,
          "content-type": patch.type ?? "application/json",
        },
        body:
          patch.raw ?? JSON.stringify({ action: patch.action ?? "read-mock-status-local", input }),
      }),
    );
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    const editor = await person("editor");
    const reviewer = await person("reviewer");
    for (const actor of [manager, other])
      await setCampaignGrant(p, admin.user, {
        staffId: actor.user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const policies = [
      (await readCampaignWorkspace(p, manager.user)).choices.find(
        (r) => r.policies.zh && r.policies.en,
      )!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const read = () => readCampaignTaskStatus(p, manager.user, input);
    const detail = (who = manager.token, value: unknown = input, patch = {}) =>
      post(who, value, { ...patch, action: "read-mock-review-local" });
    const preflight = async (who = manager.token, value: unknown = input, patch = {}) => {
      const observed = await observeCampaignAudience(p, () =>
        post(who, value, { ...patch, action: "read-revision-preflight-local" }),
      );
      if (observed.result.status === 200)
        assert.equal(observed.statements.length, 1, "HTTP preflight reads its audience once");
      if ([400, 403, 404, 409, 413, 415].includes(observed.result.status))
        assert.equal(
          observed.statements.length,
          0,
          "rejected preflight never reads a private audience",
        );
      return observed.result;
    };
    const empty = await read();
    assert.equal(
      (await preflight()).status,
      200,
      "authorized owner can read revision preflight without a frozen list",
    );
    assert.equal(empty.snapshot, null);
    assert.equal(empty.total, 0);
    assert.equal(empty.attempts, 0);
    assert.equal(
      (await post(manager.token, input, { action: "read-mock-review-local" })).status,
      200,
      "authorized owner can read an empty review detail list",
    );
    for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
      for (const request of [post, detail, preflight])
        assert.equal((await request(token, input)).status, 403);
    assert.equal((await preflight(other.token)).status, 404);
    assert.equal(
      (await preflight(manager.token, input, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await preflight(manager.token, input, { type: "text/plain" })).status, 415);
    assert.equal((await preflight(manager.token, input, { raw: "x".repeat(17000) })).status, 413);
    assert.equal((await post(other.token, input)).status, 404);
    assert.equal((await detail(other.token)).status, 404);
    assert.equal(
      (await detail(manager.token, input, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await detail(manager.token, input, { type: "text/plain" })).status, 415);
    assert.equal(
      (await post(manager.token, input, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await post(manager.token, input, { type: "text/plain" })).status, 415);
    assert.equal((await post(manager.token, input, { raw: "x".repeat(17000) })).status, 413);
    for (const invalid of [
      null,
      [],
      {},
      { ...input, owner: other.user.id },
      { ...input, token: key },
      { ...input, reset: true },
    ])
      for (const request of [post, detail, preflight])
        assert.equal((await request(manager.token, invalid)).status, 400);
    for (const page of [0, -1, 1.5, "1", 41, Number.MAX_SAFE_INTEGER])
      assert.equal((await detail(manager.token, { ...input, page })).status, 400);
    assert.equal((await post(manager.token, { ...input, revision: 99 })).status, 409);
    process.env.APP_ENV = "trial";
    assert.equal((await post(manager.token, input)).status, 403);
    assert.equal((await detail()).status, 403);
    assert.equal((await preflight()).status, 403);
    process.env.APP_ENV = "local";
    for (let i = 0; i < 10; i++) {
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
    const test = await campaignMockChecks(p, manager.user, "test", input);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...input,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    await freezeCampaignRecipients(p, manager.user, input);
    await setMockCampaignBudget(p, admin.user, { remaining: 9, reason: "虚构状态测试" });
    const slots: number[] = [];
    for (let i = 0; i < 9; i++) {
      const slot = await reserveMockCampaignSlot(p, manager.user, { ...input, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      slots.push(slot.id!);
    }
    const outcomes = [
      null,
      null,
      "temporary",
      "temporary",
      "unknown",
      "permanent",
      "accepted",
    ] as const;
    for (let i = 1; i <= 7; i++) {
      await advanceDispatchClock(p);
      const lease = await claimMockCampaignTask(p, manager.user, { ...input, slotId: slots[i] });
      assert.equal(lease.state, "claimed-local");
      if (lease.state !== "claimed-local") throw Error("missing lease");
      if (i === 1) continue;
      const target = { ...input, slotId: slots[i], token: lease.token };
      await beginMockCampaignAttempt(p, manager.user, target);
      if (outcomes[i - 1])
        await recordMockCampaignOutcome(p, manager.user, { ...target, outcome: outcomes[i - 1] });
    }
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()+interval '1 hour' WHERE slot_id=ANY($1)",
      [[slots[1], slots[2]]],
    );
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=statement_timestamp()-interval '1 millisecond' WHERE slot_id=$1",
      [slots[4]],
    );
    await db.query(
      "UPDATE subscription_campaign_jobs SET status='cancelled' WHERE id=(SELECT job_id FROM subscription_campaign_mock_slots WHERE id=$1)",
      [slots[8]],
    );
    const counts = {
      unreserved: 1,
      ready: 1,
      leased: 1,
      attempting: 1,
      retryWaiting: 1,
      retryReady: 1,
      review: 1,
      failed: 1,
      completed: 1,
      cancelled: 1,
    };
    const before = await databaseFingerprints(db);
    const status = await read();
    assert.deepEqual(status.counts, counts);
    assert.equal(status.total, 10);
    assert.equal(status.attempts, 6);
    const markup = renderToStaticMarkup(
      createElement(CampaignWorkspace, {
        workspace: await readCampaignWorkspace(p, manager.user),
        draft: await readCampaignDraft(p, manager.user, input.campaignKey),
        taskStatus: status,
        reviewDetails: await readCampaignReviewDetails(p, manager.user, input),
        revisionPreflight: await readCampaignRevisionPreflight(p, manager.user, input),
      }),
    );
    assert.match(markup, /本地模拟任务状态/);
    assert.match(markup, /等待重试<\/dt><dd>1<\/dd>/);
    assert.match(markup, /待核对<\/dt><dd>1<\/dd>/);
    assert.match(markup, /刷新状态/);
    assert.match(markup, /不会自动重发/);
    assert.match(markup, /待核对任务明细/);
    assert.match(markup, /结果不明/);
    assert.match(markup, /记录模拟结果/);
    assert.match(markup, /刷新待核对明细/);
    assert.match(markup, /同一活动改版续发预检/);
    assert.match(markup, /刷新改版预检/);
    assert.match(markup, /不补入后来订阅的人/);
    assert.match(markup, /实际改版续发尚未开放/);
    assert.doesNotMatch(markup, /@example.invalid|leaseTokenHash|PRIVATE|清除按钮/);
    assert.doesNotMatch(markup, /重置待核对|立即重试/);
    assert.deepEqual(status.snapshot, { revision: 1, current: true });
    assert.ok(Date.parse(status.nextAttemptAt!) > Date.parse(status.asOf));
    const response = await post(manager.token, input);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const receipt = (await response.json()).taskStatus;
    assert.deepEqual(receipt.counts, counts);
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /@|recipient|subscription|token|hash|subject|body|slotId|jobId|password/i,
    );
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "reading status and HTTP refresh never mutate any table",
    );
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp() WHERE slot_id=$1",
      [slots[2]],
    );
    assert.equal(
      (await read()).counts.review,
      2,
      "expired started lease is review even before a write operation",
    );
    assert.equal((await read()).counts.attempting, 0);
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=jsonb_build_array((statement_timestamp()-interval '23 hours')::text) WHERE slot_id=$1",
      [slots[3]],
    );
    assert.equal((await read()).counts.review, 3, "23 hour boundary stops retry");
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=jsonb_build_array(now()::text,now()::text,now()::text,now()::text,now()::text) WHERE slot_id=$1",
      [slots[4]],
    );
    const capped = await read();
    assert.equal(capped.counts.review, 4, "five attempts cannot be presented as ready to retry");
    assert.equal(capped.counts.retryReady, 0);
    assert.equal(capped.nextAttemptAt, null);
    const expectedHistory = await readCampaignReviewDetails(p, manager.user, input);
    const activeFacts = (
      await db.query(
        "SELECT id, active_fact_version_id FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
      )
    ).rows;
    assert.ok(activeFacts.length > 0);
    try {
      await db.query(
        "UPDATE policy_groups SET active_fact_version_id=NULL WHERE active_fact_version_id IS NOT NULL",
      );
      assert.equal(
        (await readCampaignDraft(p, manager.user, input.campaignKey)).current,
        false,
        "fixture must really invalidate the source",
      );
      const invalidBefore = await databaseFingerprints(db);
      const invalidResponse = await detail();
      assert.equal(
        invalidResponse.status,
        200,
        "source-invalid review history must remain readable",
      );
      const invalidHistory = await readCampaignReviewDetails(p, manager.user, input);
      const invalidPreflight = await preflight();
      assert.equal(invalidPreflight.status, 200);
      assert.ok((await invalidPreflight.json()).preflight.blockers.includes("source-changed"));
      const invalidReceipt = (await invalidResponse.json()).reviewDetails;
      assert.deepEqual(invalidHistory.rows, expectedHistory.rows);
      assert.deepEqual(invalidReceipt.rows, expectedHistory.rows);
      assert.deepEqual(invalidReceipt.snapshot, expectedHistory.snapshot);
      assert.equal(invalidReceipt.total, 4);
      assert.doesNotMatch(
        JSON.stringify(invalidReceipt),
        /@|token|hash|subscription|recipient|message|recordId/i,
      );
      assert.deepEqual(
        await databaseFingerprints(db),
        invalidBefore,
        "reading source-invalid history never changes any table",
      );
    } finally {
      for (const row of activeFacts)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.active_fact_version_id,
          row.id,
        ]);
    }
    await assertCampaignReviewDetails(p, db, manager.user, input, slots);
    const detailBefore = await databaseFingerprints(db);
    const detailResponse = await detail();
    assert.equal(detailResponse.status, 200);
    assert.match(detailResponse.headers.get("cache-control")!, /no-store/);
    assert.match(detailResponse.headers.get("x-robots-tag")!, /noindex/);
    assert.equal(detailResponse.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await detailResponse.json()).reviewDetails.total, 4);
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => detail();
      assert.equal(
        (await loadCampaignReviewDetails(input, 1)).rows.length,
        4,
        "actual detail API is accepted by the strict refresh client",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.deepEqual(await databaseFingerprints(db), detailBefore);
    input.revision = await assertCampaignRevisionPreflight(
      p,
      db,
      manager.user,
      input,
      slots,
      preflight,
      subscribers,
    );
    await setCampaignPause(p, manager.user, { ...input, paused: true, reason: "历史状态仍可读" });
    assert.ok((await (await preflight()).json()).preflight.blockers.includes("paused"));
    assert.equal((await post(manager.token, input)).status, 200);
    process.env.SUBSCRIPTIONS_ENABLED = "false";
    assert.equal((await detail()).status, 200, "disabled and paused history remains readable");
    assert.equal(
      (await post(manager.token, input)).status,
      200,
      "disabled configuration must not hide history",
    );
    process.env.SUBSCRIPTIONS_ENABLED = env.SUBSCRIPTIONS_ENABLED;
    await cancelMockCampaign(p, manager.user, { ...input, reason: "状态历史测试" });
    const stoppedBefore = await databaseFingerprints(db);
    const stoppedPreflight = (await (await preflight()).json()).preflight;
    assert.ok(stoppedPreflight.blockers.includes("cancelled"));
    assert.equal(stoppedPreflight.counts.candidates, 0);
    assert.deepEqual(await databaseFingerprints(db), stoppedBefore);
    const cancelled = await read();
    assert.equal(cancelled.counts.completed, 1);
    assert.equal(cancelled.counts.failed, 1);
    assert.equal(cancelled.counts.review, 4, "uncertain attempt history survives cancellation");
    assert.equal((await readCampaignReviewDetails(p, manager.user, input)).total, 4);
    assert.equal((await post(manager.token, input)).status, 200);
    const newer = await saveCampaignDraft(p, manager.user, { ...input, policies });
    const current = { ...input, revision: newer.revision };
    assert.equal((await detail()).status, 409);
    assert.equal((await preflight()).status, 409);
    assert.deepEqual((await readCampaignReviewDetails(p, manager.user, current)).snapshot, {
      revision: 1,
      current: false,
    });
    assert.equal((await post(manager.token, input)).status, 409);
    const historical = await readCampaignTaskStatus(p, manager.user, current);
    assert.deepEqual(historical.snapshot, { revision: 1, current: false });
    assert.equal(historical.total, 10);
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await detail(manager.token, current)).status, 403);
    assert.equal((await preflight(manager.token, current)).status, 403);
    assert.equal(
      (await post(manager.token, current)).status,
      403,
      "old session cannot bypass revoked grant",
    );
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: true,
    });
    assert.equal((await detail(manager.token, current)).status, 200);
    await p.update({
      collection: "staff",
      id: manager.user.id,
      user: admin.user,
      data: { active: false },
    });
    assert.equal((await post(manager.token, current)).status, 403);
    assert.equal((await detail(manager.token, current)).status, 403);
    assert.equal((await preflight(manager.token, current)).status, 403);
    console.log("PASS 本地模拟任务状态汇总、重试待核对边界、本人权限、只读刷新和历史保留");
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
    ] as const)
      await p.delete({ collection, where: {} });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
