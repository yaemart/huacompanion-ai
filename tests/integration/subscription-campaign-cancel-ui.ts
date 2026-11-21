import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import {
  CampaignPauseControls,
  campaignCancelInput,
} from "../../src/components/subscriptions/CampaignPauseControls";
import {
  readCampaignPause,
  setCampaignPause,
} from "../../src/server/subscription-campaign-control";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import {
  freezeCampaignRecipients,
  readCampaignFreeze,
} from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";

export async function testCampaignCancelUI(p: Payload) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  const subscribers: number[] = [];
  const origin = new URL(process.env.APP_URL!).origin;
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构取消按钮测试",
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
        body: patch.raw ?? JSON.stringify({ action: patch.action ?? "cancel-local", input }),
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
    const policies = [
      (await readCampaignWorkspace(p, manager.user)).choices.find(
        (r) => r.policies.zh && r.policies.en,
      )!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const change = { ...input, reason: "虚构取消按钮原因", confirmed: true };
    const fullDraft = { ...draft, owner: other.user.id };
    assert.deepEqual(campaignCancelInput(fullDraft, change.reason, true), change);
    const queueBefore = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
      assert.equal((await post(token, change)).status, 403);
    assert.equal((await post(other.token, change)).status, 404);
    assert.equal(
      (await post(manager.token, change, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await post(manager.token, change, { type: "text/plain" })).status, 415);
    assert.equal((await post(manager.token, change, { raw: "x".repeat(17000) })).status, 413);
    for (const invalid of [
      null,
      [],
      {},
      { ...input, reason: "虚构" },
      { ...change, confirmed: false },
      { ...change, confirmed: "true" },
      { ...change, reason: " " },
      { ...change, reason: "x".repeat(501) },
      { ...change, owner: other.user.id },
      { ...change, paused: true },
    ])
      assert.equal((await post(manager.token, invalid)).status, 400);
    assert.equal(
      (await post(manager.token, { ...change, revision: draft.revision + 1 })).status,
      409,
    );
    await setCampaignPause(p, manager.user, { ...input, paused: true, reason: "未确认仍可暂停" });
    const paused = await readCampaignPause(p, manager.user, input);
    const render = (dirty = false, enabled = true, disabled = false, uncertain = false) =>
      renderToStaticMarkup(
        createElement(CampaignPauseControls, {
          draft: input,
          control: paused,
          dirty,
          enabled,
          disabled,
          uncertain,
          canResume: false,
          onChange: () => undefined,
          onUncertainChange: () => undefined,
        }),
      );
    for (const dirty of [false, true]) {
      assert.match(render(dirty), /取消后不能恢复/);
      assert.match(render(dirty), /历史和已占份额/);
      assert.match(render(dirty), /<button[^>]*disabled=""[^>]*>确认取消本地活动/);
      assert.match(render(dirty), /<input[^>]*type="checkbox"[^>]*required=""/);
    }
    for (const markup of [
      render(false, false),
      render(false, true, true),
      render(false, true, false, true),
    ])
      assert.match(markup, /<button[^>]*disabled=""[^>]*>确认取消本地活动/);
    const response = await post(manager.token, change);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    const receipt = (await response.json()).cancellation;
    assert.equal(receipt.campaignKey, draft.campaignKey);
    assert.equal(receipt.reason, change.reason);
    assert.ok(receipt.cancelledAt);
    assert.doesNotMatch(JSON.stringify(receipt), /@|subscription|recipient|token|password/);
    const reloaded = await post(manager.token, input, { action: "read-control-local" });
    assert.equal((await reloaded.json()).control.cancelledAt, receipt.cancelledAt);
    const terminal = renderToStaticMarkup(
      createElement(CampaignPauseControls, {
        draft: input,
        control: await readCampaignPause(p, manager.user, input),
        dirty: true,
        enabled: true,
        canResume: true,
        uncertain: false,
        onChange: () => undefined,
        onUncertainChange: () => undefined,
      }),
    );
    assert.match(terminal, /当前状态：已取消/);
    assert.doesNotMatch(terminal, /<form|<button/);
    const beforeAudit = (
      await p.count({ collection: "audit-events", where: { action: { equals: "cancel-local" } } })
    ).totalDocs;
    assert.equal((await post(manager.token, { ...change, reason: "不能覆盖" })).status, 200);
    assert.equal((await readCampaignPause(p, manager.user, input)).cancelReason, change.reason);
    assert.equal(
      (await p.count({ collection: "audit-events", where: { action: { equals: "cancel-local" } } }))
        .totalDocs,
      beforeAudit,
    );
    const live = await saveCampaignDraft(p, manager.user, { policies });
    const current = { campaignKey: live.campaignKey, revision: live.revision };
    for (let i = 0; i < 3; i++) {
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
    const tested = await campaignMockChecks(p, manager.user, "test", current);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...current,
      testId: tested.testId,
      readable: ["zh", "en"],
    });
    const frozen = await freezeCampaignRecipients(p, manager.user, current);
    await setMockCampaignBudget(p, admin.user, { remaining: 2, reason: "虚构按钮额度" });
    const one = await reserveMockCampaignSlot(p, manager.user, { ...current, key: randomUUID() });
    const two = await reserveMockCampaignSlot(p, manager.user, { ...current, key: randomUUID() });
    const doneTarget = { ...current, slotId: one.id! },
      pendingTarget = { ...current, slotId: two.id! };
    const doneLease = await claimMockCampaignTask(p, manager.user, doneTarget);
    const pendingLease = await claimMockCampaignTask(p, manager.user, pendingTarget);
    if (doneLease.state !== "claimed-local" || pendingLease.state !== "claimed-local")
      throw Error("missing leases");
    await completeMockCampaignTask(p, manager.user, { ...doneTarget, token: doneLease.token });
    const completed = await p.findByID({
      collection: "subscription-campaign-mock-leases",
      id: doneLease.id,
      depth: 0,
    });
    const slots = (await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 })).docs;
    const budget = (await p.find({ collection: "subscription-campaign-mock-budgets", depth: 0 }))
      .docs;
    const stopped = (
      await (
        await post(manager.token, { ...current, reason: "虚构按钮取消有任务活动", confirmed: true })
      ).json()
    ).cancellation;
    assert.equal(stopped.cancelledJobs, 2);
    assert.equal(stopped.invalidatedLeases, 1);
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-slots", depth: 0 })).docs,
      slots,
    );
    assert.deepEqual(
      (await p.find({ collection: "subscription-campaign-mock-budgets", depth: 0 })).docs,
      budget,
    );
    assert.deepEqual(
      await p.findByID({
        collection: "subscription-campaign-mock-leases",
        id: doneLease.id,
        depth: 0,
      }),
      completed,
    );
    assert.deepEqual((await readCampaignFreeze(p, manager.user, current))!.counts, frozen.counts);
    await assert.rejects(
      completeMockCampaignTask(p, manager.user, { ...pendingTarget, token: pendingLease.token }),
      { status: 409 },
    );
    assert.equal(
      (
        await post(
          manager.token,
          { ...current, paused: false, reason: "不能恢复" },
          { action: "control-local" },
        )
      ).status,
      409,
    );
    assert.equal((await post(manager.token, current, { action: "freeze-local" })).status, 409);
    process.env.APP_ENV = "trial";
    assert.equal((await post(manager.token, change)).status, 403);
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await post(manager.token, change)).status, 403);
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, queueBefore);
    console.log("PASS 后台取消按钮接口、显式确认、权限同源、终态刷新、历史份额及旧租约拒绝");
  } finally {
    for (const collection of [
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
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
