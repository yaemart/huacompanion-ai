import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import {
  CampaignPauseControls,
  campaignControlInput,
} from "../../src/components/subscriptions/CampaignPauseControls";
import { CampaignMockChecks } from "../../src/components/subscriptions/CampaignMockChecks";
import { readCampaignPause } from "../../src/server/subscription-campaign-control";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  completeMockCampaignTask,
} from "../../src/server/subscription-campaign-leases";

export async function testCampaignPauseUI(p: Payload) {
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
        name: "虚构按钮测试",
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
    patch: { origin?: string; type?: string; raw?: string } = {},
  ) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin: patch.origin ?? origin,
          "content-type": patch.type ?? "application/json",
        },
        body: patch.raw ?? JSON.stringify({ action: "control-local", input }),
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
    for (const staff of [manager, other])
      await setCampaignGrant(p, admin.user, {
        staffId: staff.user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager.user);
    const policies = [
      workspace.choices.find((row) => row.policies.zh && row.policies.en)!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const change = { ...input, paused: true, reason: "虚构按钮暂停原因" };
    const jobs = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    for (const who of ["", admin.token, operations.token, editor.token, reviewer.token])
      for (const paused of [true, false])
        assert.equal((await post(who, { ...change, paused })).status, 403);
    assert.equal((await post(other.token, change)).status, 404);
    assert.equal(
      (await post(manager.token, change, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await post(manager.token, change, { type: "text/plain" })).status, 415);
    assert.equal((await post(manager.token, change, { raw: "x".repeat(17000) })).status, 413);
    for (const invalid of [
      { ...change, reason: " " },
      { ...change, reason: "x".repeat(501) },
      { ...change, owner: other.user.id },
      { ...change, paused: "true" },
    ])
      assert.equal((await post(manager.token, invalid)).status, 400);
    assert.equal(
      (await post(manager.token, { ...change, revision: draft.revision + 1 })).status,
      409,
    );
    const fullDraft = { ...draft, unexpected: "private" };
    assert.deepEqual(campaignControlInput(fullDraft, true, "暂停"), {
      campaignKey: draft.campaignKey,
      revision: draft.revision,
      paused: true,
      reason: "暂停",
    });
    const initial = await readCampaignPause(p, manager.user, input);
    const render = (
      control = initial,
      dirty = false,
      canResume = false,
      enabled = true,
      disabled = false,
    ) =>
      renderToStaticMarkup(
        createElement(CampaignPauseControls, {
          draft: input,
          control,
          dirty,
          canResume,
          enabled,
          disabled,
          onChange: () => undefined,
        }),
      );
    assert.match(render(), /原因（必填）/);
    assert.match(render(), /required=""/);
    assert.doesNotMatch(render(initial, true), /<button[^>]*disabled=""[^>]*>暂停本地活动/);
    assert.match(render(initial, false, false, false), /<button[^>]*disabled=""[^>]*>暂停本地活动/);
    assert.match(
      render(initial, false, false, true, true),
      /<button[^>]*disabled=""[^>]*>暂停本地活动/,
    );
    const response = await post(manager.token, change);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    const result = await response.json();
    assert.equal(result.control.paused, true);
    assert.doesNotMatch(JSON.stringify(result), /@|recipient|password|token|API_KEY|subscription/);
    const pausedState = await readCampaignPause(p, manager.user, input);
    assert.match(render(pausedState), /当前状态：已暂停/);
    assert.match(render(pausedState), /<button[^>]*disabled=""[^>]*>恢复本地活动/);
    assert.match(render(pausedState), /逐语言确认/);
    assert.match(render(pausedState, true, true), /请先保存/);
    assert.doesNotMatch(
      render(pausedState, false, true),
      /<button[^>]*disabled=""[^>]*>恢复本地活动/,
    );
    assert.match(render({ ...pausedState, reason: "<script>虚构</script>" }), /&lt;script&gt;/);
    assert.equal((await post(manager.token, { ...change, paused: false })).status, 409);
    const tested = await campaignMockChecks(p, manager.user, "test", input);
    const confirmed = await campaignMockChecks(p, manager.user, "confirm", {
      ...input,
      testId: tested.testId,
      readable: ["zh", "en"],
    });
    assert.match(
      renderToStaticMarkup(
        createElement(CampaignMockChecks, {
          draft: input,
          status: confirmed,
          dirty: false,
          paused: true,
        }),
      ),
      /<button[^>]*disabled=""[^>]*>冻结本轮名单（不发送）/,
    );
    assert.equal(
      (await post(manager.token, { ...change, paused: false, reason: "虚构按钮恢复" })).status,
      200,
    );
    const sub = await p.create({
      collection: "subscriptions",
      data: {
        email: key + "@example.invalid",
        topic: "policy-updates",
        status: "confirmed",
        locale: "en",
        privacyVersion: key,
        sourcePath: "/en",
        consentVersion: 1,
        consentedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      },
    });
    subscribers.push(sub.id);
    await freezeCampaignRecipients(p, manager.user, input);
    await setMockCampaignBudget(p, admin.user, { remaining: 1, reason: "虚构按钮验收" });
    const slot = await reserveMockCampaignSlot(p, manager.user, { ...input, key: randomUUID() });
    const target = { ...input, slotId: slot.id! };
    const lease = await claimMockCampaignTask(p, manager.user, target);
    assert.equal(lease.state, "claimed-local");
    if (lease.state !== "claimed-local") throw Error("missing test lease");
    const stopped = await (await post(manager.token, change)).json();
    assert.equal(stopped.control.invalidatedLeases, 1);
    assert.equal((await post(manager.token, { ...change, paused: false })).status, 200);
    await assert.rejects(
      completeMockCampaignTask(p, manager.user, { ...target, token: lease.token }),
      { status: 409 },
    );
    assert.equal((await p.count({ collection: "subscription-campaign-mock-slots" })).totalDocs, 1);
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    assert.equal(
      (await post(manager.token, change)).status,
      200,
      "stop must not need an effective mock proof",
    );
    assert.equal((await post(manager.token, { ...change, paused: false })).status, 409);
    process.env.APP_ENV = "trial";
    assert.equal((await post(manager.token, change)).status, 403);
    process.env.APP_ENV = "local";
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    assert.equal((await post(manager.token, change)).status, 403);
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, jobs);
    console.log("PASS 后台暂停恢复接口、原因与确认门禁、本人权限、同源防护、冻结状态及旧租约拒绝");
  } finally {
    for (const collection of [
      "subscription-campaign-controls",
      "subscription-campaign-mock-leases",
      "subscription-campaign-mock-slots",
      "subscription-campaign-mock-budgets",
      "subscription-campaign-jobs",
      "subscription-campaign-batches",
    ] as const)
      await p.delete({ collection, where: {} });
    await p.delete({
      collection: "subscription-campaign-checks",
      where: { kind: { equals: "mock-confirm" } },
    });
    await p.delete({ collection: "subscription-campaign-checks", where: {} });
    await p.delete({
      collection: "subscription-campaign-drafts",
      where: { owner: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-grants",
      where: { staff: { in: people } },
    });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscribers } } });
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
