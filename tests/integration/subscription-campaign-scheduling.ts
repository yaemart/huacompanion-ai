import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";

import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { setCampaignPause } from "../../src/server/subscription-campaign-control";
import { cancelMockCampaign } from "../../src/server/subscription-campaign-cancel";

import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignScheduling(p: Payload, url: URL) {
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
        name: "虚构调度测试",
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
          patch.raw ??
          JSON.stringify({ action: patch.action ?? "read-next-mock-slot-local", input }),
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
    const workspace = await readCampaignWorkspace(p, manager.user);
    const policies = [workspace.choices.find((r) => r.policies.zh && r.policies.en)!.policies];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    assert.equal((await post(manager.token, input)).status, 409);
    const test = await campaignMockChecks(p, manager.user, "test", input);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...input,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    for (let i = 0; i < 10; i++) {
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
    assert.equal((await post(manager.token, input)).status, 409);
    await freezeCampaignRecipients(p, manager.user, input);
    const action = async (name: string, value: unknown = input) => {
      const response = await post(manager.token, value, { action: name });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const next = async () => {
      const response = await post(manager.token, input);
      assert.equal(response.status, 200, await response.clone().text());
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.match(response.headers.get("x-robots-tag")!, /noindex/);
      return (await response.json()).nextTask;
    };
    assert.deepEqual(Object.keys(await next()).sort(), ["asOf", "nextAttemptAt", "slotId"]);
    assert.equal((await next()).slotId, null);
    for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
      assert.equal((await post(token, input)).status, 403);
    assert.equal((await post(other.token, input)).status, 404);
    assert.equal(
      (await post(manager.token, input, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await post(manager.token, input, { type: "text/plain" })).status, 415);
    assert.equal((await post(manager.token, input, { raw: "x".repeat(17000) })).status, 413);
    for (const value of [
      null,
      [],
      {},
      { ...input, slotId: 1 },
      { ...input, owner: manager.user.id },
    ])
      assert.equal((await post(manager.token, value)).status, 400);
    const configured = await post(
      admin.token,
      { remaining: 10, reason: "虚构调度" },
      { action: "set-mock-budget-local" },
    );
    assert.equal(configured.status, 200);
    const slots: number[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await action("reserve-mock-slot-local", { ...input, key: randomUUID() });
      assert.equal(result.reservation.state, "reserved-local");
      slots.push(result.reservation.id);
    }
    const before = await databaseFingerprints(db);
    assert.equal((await next()).slotId, slots[0]);
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "selection cannot reserve or lease or begin",
    );
    const markup = renderToStaticMarkup(
      createElement(CampaignWorkspace, {
        workspace,
        draft: await (
          await import("../../src/server/subscription-campaign-drafts")
        ).readCampaignDraft(p, manager.user, input.campaignKey),
        taskSlots: slots,
      }),
    );
    assert.match(markup, /自动领取/);
    const claim = async (slotId: number) =>
      (await action("claim-mock-task-local", { ...input, slotId })).task;
    const outcome = async (slotId: number, outcome: string) => {
      const lease = await claim(slotId);
      assert.equal(lease.state, "claimed-local");
      const command = { ...input, slotId, token: lease.token };
      assert.equal((await action("begin-mock-attempt-local", command)).task.attempts, 1);
      return (await action("record-mock-result-local", { ...command, outcome })).task;
    };
    await outcome(slots[0], "temporary");
    await outcome(slots[1], "accepted");
    await outcome(slots[2], "unknown");
    await outcome(slots[3], "permanent");
    const occupied = await claim(slots[4]);
    assert.equal(occupied.state, "claimed-local");
    const expired = await claim(slots[5]);
    await action("begin-mock-attempt-local", { ...input, slotId: slots[5], token: expired.token });
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE slot_id=$1",
      [slots[5]],
    );
    await outcome(slots[8], "temporary");
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=$1::jsonb WHERE slot_id=$2",
      [JSON.stringify(Array(5).fill(new Date().toISOString())), slots[8]],
    );
    await outcome(slots[9], "temporary");
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=$1::jsonb WHERE slot_id=$2",
      [JSON.stringify([new Date(Date.now() - 24 * 3600000).toISOString()]), slots[9]],
    );
    const invalid = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: slots[7],
      depth: 0,
    });
    const invalidJob = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: Number(invalid.job),
      depth: 0,
    });
    await p.update({
      collection: "subscriptions",
      id: Number(invalidJob.subscription),
      data: { status: "unsubscribed" },
    });
    const beforeStates = await databaseFingerprints(db);
    const candidate = await next();
    assert.equal(
      candidate.slotId,
      slots[6],
      "skip waiting, active lease, terminal, expired attempts and current ineligible",
    );
    assert.doesNotMatch(JSON.stringify(candidate), /email|hash|token|message|recipient/i);
    assert.deepEqual(await databaseFingerprints(db), beforeStates);
    const competition = await Promise.all([claim(slots[6]), claim(slots[6])]);
    assert.deepEqual(competition.map((r) => r.state).sort(), ["busy", "claimed-local"]);
    const waiting = await next();
    assert.equal(waiting.slotId, null);
    assert.ok(Date.parse(waiting.nextAttemptAt) > Date.parse(waiting.asOf));
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=NULL WHERE slot_id=$1",
      [slots[0]],
    );
    assert.equal((await post(manager.token, input)).status, 503);
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=statement_timestamp()+interval '30 seconds' WHERE slot_id=$1",
      [slots[0]],
    );
    const priorAttempt = (
      await p.find({
        collection: "subscription-campaign-mock-attempts",
        where: { slot: { equals: slots[0] } },
        depth: 0,
      })
    ).docs[0];
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET next_attempt_at=statement_timestamp()-interval '1 second' WHERE slot_id=$1",
      [slots[0]],
    );
    assert.equal((await next()).slotId, slots[0]);
    const retry = await claim(slots[0]);
    assert.equal(retry.state, "claimed-local");
    const started = await action("begin-mock-attempt-local", {
      ...input,
      slotId: slots[0],
      token: retry.token,
    });
    assert.equal(started.task.attempts, 2);
    const retryAttempt = await p.findByID({
      collection: "subscription-campaign-mock-attempts",
      id: priorAttempt.id,
      depth: 0,
    });
    assert.equal(retryAttempt.key, priorAttempt.key);
    assert.deepEqual(retryAttempt.message, priorAttempt.message);
    // The candidate is advisory: changes after selection remain subject to the original claim guard.
    await db.query(
      "UPDATE subscription_campaign_mock_leases SET expires_at=statement_timestamp()-interval '1 second' WHERE slot_id=$1",
      [slots[4]],
    );
    assert.equal((await next()).slotId, slots[4]);
    await setCampaignPause(p, manager.user, { ...input, paused: true, reason: "虚构暂停" });
    assert.equal((await post(manager.token, input)).status, 409);
    assert.equal(
      (
        await post(
          manager.token,
          { ...input, slotId: slots[4] },
          { action: "claim-mock-task-local" },
        )
      ).status,
      409,
    );
    await setCampaignPause(p, manager.user, { ...input, paused: false, reason: "虚构恢复" });
    process.env.APP_ENV = "trial";
    assert.equal((await post(manager.token, input)).status, 403);
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await post(manager.token, input)).status, 403);
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: true,
    });
    await p.update({
      collection: "staff",
      id: manager.user.id,
      user: admin.user,
      data: { role: "operations", additionalRoles: [] },
    });
    assert.equal((await post(manager.token, input)).status, 403);
    await p.update({
      collection: "staff",
      id: manager.user.id,
      user: admin.user,
      data: { role: "manager", additionalRoles: [] },
    });
    manager.token = (
      await p.login({ collection: "staff", data: { email: manager.user.email, password: key } })
    ).token!;
    const oldFrom = process.env.WORKFLOW_MAIL_FROM;
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    assert.equal((await post(manager.token, input)).status, 409);
    if (oldFrom === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = oldFrom;
    const refreshed = await campaignMockChecks(p, manager.user, "test", input);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...input,
      testId: refreshed.testId,
      readable: ["zh", "en"],
    });
    await cancelMockCampaign(p, manager.user, { ...input, reason: "虚构取消" });
    assert.equal((await post(manager.token, input)).status, 409);
    console.log("PASS 本地任务自动候选接口、权限与状态时间筛选、只读、竞争及原领取守卫");
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
