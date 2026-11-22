import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { readCampaignMockSlots } from "../../src/server/subscription-campaign-task-options";
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
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignPlayground(p: Payload, url: URL) {
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
        name: "虚构演练测试",
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
          patch.raw ?? JSON.stringify({ action: patch.action ?? "read-mock-slots-local", input }),
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
    const read = () => readCampaignMockSlots(p, manager.user, input);
    assert.deepEqual(await read(), []);
    const actions = [
      "read-mock-slots-local",
      "claim-mock-task-local",
      "begin-mock-attempt-local",
      "record-mock-result-local",
    ];
    for (const action of actions) {
      const value =
        action === actions[0]
          ? input
          : {
              ...input,
              slotId: 1,
              ...(action !== actions[1] ? { token: key } : {}),
              ...(action === actions[3] ? { outcome: "unknown" } : {}),
            };
      for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
        assert.equal((await post(token, value, { action })).status, 403);
      assert.equal((await post(other.token, value, { action })).status, 404);
      assert.equal(
        (await post(manager.token, value, { action, origin: "https://elsewhere.invalid" })).status,
        403,
      );
      assert.equal((await post(manager.token, value, { action, type: "text/plain" })).status, 415);
      assert.equal(
        (await post(manager.token, value, { action, raw: "x".repeat(17000) })).status,
        413,
      );
      for (const invalid of [
        null,
        [],
        {},
        { ...value, owner: other.user.id },
        { ...value, reset: true },
      ])
        assert.equal((await post(manager.token, invalid, { action })).status, 400);
      assert.equal((await post(manager.token, { ...value, revision: 99 }, { action })).status, 409);
      process.env.APP_ENV = "trial";
      assert.equal((await post(manager.token, value, { action })).status, 403);
      process.env.APP_ENV = "local";
    }
    for (let i = 0; i < 7; i++) {
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
    const prepare = async () => {
      const test = await campaignMockChecks(p, manager.user, "test", input);
      await campaignMockChecks(p, manager.user, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    await prepare();
    await freezeCampaignRecipients(p, manager.user, input);
    await setMockCampaignBudget(p, admin.user, { remaining: 7, reason: "虚构演练余额" });
    const slots: number[] = [];
    for (let i = 0; i < 7; i++) {
      const slot = await reserveMockCampaignSlot(p, manager.user, { ...input, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      slots.push(slot.id!);
    }
    const markup = renderToStaticMarkup(
      createElement(CampaignWorkspace, {
        workspace: await readCampaignWorkspace(p, manager.user),
        draft: await readCampaignDraft(p, manager.user, input.campaignKey),
        checks: await campaignMockChecks(p, manager.user, "status", input),
        taskSlots: slots,
      }),
    );
    assert.match(markup, /本地模拟任务演练/);
    assert.match(markup, /领取所选任务/);
    assert.match(markup, /开始本地尝试/);
    assert.match(markup, /<button[^>]*disabled=""[^>]*>记录模拟结果/);
    assert.doesNotMatch(markup, /清除待核对|重置待核对/);
    const beforeRead = await databaseFingerprints(db);
    assert.deepEqual(await read(), slots);
    const listing = await post(manager.token, input);
    assert.equal(listing.status, 200);
    assert.deepEqual(await listing.json(), { slots });
    assert.match(listing.headers.get("cache-control")!, /no-store/);
    assert.equal(listing.headers.get("referrer-policy"), "no-referrer");
    assert.match(listing.headers.get("x-robots-tag")!, /noindex/);
    assert.deepEqual(await databaseFingerprints(db), beforeRead);
    const call = async (action: string, value: unknown) => {
      const response = await post(manager.token, value, { action });
      assert.equal(response.status, 200);
      return (await response.json()).task;
    };
    const claim = (slotId: number) => call(actions[1], { ...input, slotId });
    const begin = (value: object) => call(actions[2], value);
    const result = (value: object, outcome: string, retryAfterMs?: number) =>
      call(actions[3], {
        ...value,
        outcome,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    const target = { ...input, slotId: slots[0] };
    const lease = await claim(slots[0]);
    assert.equal(lease.state, "claimed-local");
    assert.match(lease.token, /^[a-f0-9-]{36}$/);
    assert.equal((await claim(slots[0])).state, "busy");
    const leased = { ...target, token: lease.token };
    await db.query(`CREATE FUNCTION reject_playground_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-mock-attempts' THEN RAISE EXCEPTION 'reject attempt audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_playground_attempt AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_playground_attempt();`);
    try {
      const before = await databaseFingerprints(db);
      assert.equal((await post(manager.token, leased, { action: actions[2] })).status, 503);
      assert.deepEqual(
        await databaseFingerprints(db),
        before,
        "failed audit COMMIT rolls back the HTTP attempt",
      );
    } finally {
      await db.query(
        "DROP TRIGGER reject_playground_attempt ON audit_events; DROP FUNCTION reject_playground_attempt()",
      );
    }
    const started = await begin(leased);
    assert.equal(started.state, "attempting-local");
    assert.equal(started.started, true);
    assert.equal((await begin(leased)).started, false);
    const waiting = await result(leased, "temporary");
    assert.equal(waiting.state, "retry-local");
    assert.equal(waiting.attempts, 1);
    assert.ok(Date.parse(waiting.nextAttemptAt) > Date.now());
    assert.equal((await claim(slots[0])).state, "retry-local");
    assert.deepEqual(await result(leased, "temporary"), waiting);
    const advance = (slotId: number) =>
      db.query(
        "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=statement_timestamp()-interval '1 millisecond' WHERE slot_id=$1",
        [slotId],
      );
    await advance(slots[0]);
    let current = { ...target, token: (await claim(slots[0])).token };
    assert.notEqual(current.token, leased.token);
    assert.equal((await post(manager.token, leased, { action: actions[2] })).status, 409);
    await begin(current);
    const rateLimited = await result(current, "rate-limited", 120000);
    assert.equal(rateLimited.state, "retry-local");
    assert.ok(Date.parse(rateLimited.nextAttemptAt) > Date.now() + 110000);
    for (let attempt = 3; attempt <= 5; attempt++) {
      await advance(slots[0]);
      current = { ...target, token: (await claim(slots[0])).token };
      assert.equal((await begin(current)).attempts, attempt);
      const receipt = await result(current, "temporary");
      assert.equal(receipt.state, attempt === 5 ? "review-local" : "retry-local");
    }
    const attemptRow = async (slotId: number) =>
      (
        await p.find({
          collection: "subscription-campaign-mock-attempts",
          depth: 0,
          where: { slot: { equals: slotId } },
        })
      ).docs[0];
    const terminal = await attemptRow(slots[0]);
    assert.equal((await claim(slots[0])).state, "review-local");
    assert.equal((await begin(current)).state, "review-local");
    assert.equal((await result(current, "accepted")).state, "review-local");
    assert.deepEqual(await attemptRow(slots[0]), terminal);
    for (const [index, outcome, state] of [
      [1, "unknown", "review-local"],
      [2, "permanent", "failed-local"],
      [3, "accepted", "completed-local"],
    ] as const) {
      const value = { ...input, slotId: slots[index], token: (await claim(slots[index])).token };
      await begin(value);
      assert.equal((await result(value, outcome)).state, state);
      const before = await databaseFingerprints(db);
      assert.equal((await result(value, outcome)).state, state);
      assert.equal((await claim(slots[index])).state, state);
      assert.deepEqual(await databaseFingerprints(db), before);
    }
    const interrupted = { ...input, slotId: slots[4], token: (await claim(slots[4])).token };
    await begin(interrupted);
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp() WHERE slot_id=$1",
      [slots[4]],
    );
    assert.equal((await claim(slots[4])).state, "review-local");
    const timed = { ...input, slotId: slots[5], token: (await claim(slots[5])).token };
    await begin(timed);
    await result(timed, "temporary");
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=jsonb_build_array((statement_timestamp()-interval '23 hours')::text) WHERE slot_id=$1",
      [slots[5]],
    );
    assert.equal((await claim(slots[5])).state, "review-local");
    const pending = { ...input, slotId: slots[6], token: (await claim(slots[6])).token };
    for (const value of [
      { ...pending, token: "bad" },
      { ...pending, slotId: "1" },
      { ...pending, token: undefined },
    ])
      assert.equal((await post(manager.token, value, { action: actions[2] })).status, 400);
    for (const value of [
      { ...pending, outcome: "reset" },
      { ...pending, outcome: "temporary", retryAfterMs: 1 },
      { ...pending, outcome: "rate-limited", retryAfterMs: -1 },
    ])
      assert.equal((await post(manager.token, value, { action: actions[3] })).status, 400);
    for (const action of [
      "clear-review-local",
      "complete-mock-task-local",
      "reset-mock-task-local",
    ])
      assert.equal((await post(manager.token, pending, { action })).status, 400);
    const otherDraft = await saveCampaignDraft(p, manager.user, { policies });
    const otherInput = { campaignKey: otherDraft.campaignKey, revision: otherDraft.revision };
    const otherTest = await campaignMockChecks(p, manager.user, "test", otherInput);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...otherInput,
      testId: otherTest.testId,
      readable: ["zh", "en"],
    });
    assert.equal(
      (
        await post(
          manager.token,
          { ...input, slotId: slots[6], campaignKey: otherDraft.campaignKey },
          { action: actions[1] },
        )
      ).status,
      404,
    );
    await setCampaignPause(p, manager.user, { ...input, paused: true, reason: "演练暂停" });
    assert.equal((await post(manager.token, pending, { action: actions[2] })).status, 409);
    await setCampaignPause(p, manager.user, { ...input, paused: false, reason: "演练恢复" });
    process.env.SUBSCRIPTIONS_ENABLED = "false";
    assert.equal((await post(manager.token, target, { action: actions[1] })).status, 409);
    process.env.SUBSCRIPTIONS_ENABLED = "true";
    await prepare();
    await cancelMockCampaign(p, manager.user, { ...input, reason: "演练取消" });
    assert.equal((await post(manager.token, pending, { action: actions[2] })).status, 409);
    assert.deepEqual(await read(), slots, "cancelled history options contain no credentials");
    const newer = await saveCampaignDraft(p, manager.user, { ...input, policies });
    assert.deepEqual(
      await readCampaignMockSlots(p, manager.user, { ...input, revision: newer.revision }),
      [],
    );
    assert.equal((await post(manager.token, input)).status, 409);
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    for (const action of actions) {
      const value = {
        ...input,
        revision: newer.revision,
        ...(action === actions[0] ? {} : { slotId: slots[6] }),
        ...(action === actions[2] || action === actions[3] ? { token: pending.token } : {}),
        ...(action === actions[3] ? { outcome: "unknown" } : {}),
      };
      assert.equal((await post(manager.token, value, { action })).status, 403);
    }
    const audit = (
      await p.find({
        collection: "audit-events",
        depth: 0,
        pagination: false,
        where: { actor: { equals: manager.user.id } },
      })
    ).docs;
    assert.doesNotMatch(JSON.stringify(audit), /leaseTokenHash|"token"|@example\.invalid/);
    console.log("PASS 本地模拟演练接口、本人权限、领取开始结果、重试终态、凭证隔离和历史保留");
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
