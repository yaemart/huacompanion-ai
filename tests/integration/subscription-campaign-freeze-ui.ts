import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { CampaignMockChecks } from "../../src/components/subscriptions/CampaignMockChecks";
import { readCampaignFreeze } from "../../src/server/subscription-campaign-freeze";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import {
  readCampaignDraft,
  saveCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";

export async function testCampaignFreezeUI(p: Payload) {
  const env = { ...process.env };
  const key = randomUUID();
  const people: number[] = [];
  const subscribers: number[] = [];
  const origin = new URL(process.env.APP_URL!).origin;
  const person = async (role: "admin" | "manager" | "operations") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构快照页面",
        email: `${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password: key,
      },
    });
    people.push(user.id);
    const { token } = await p.login({
      collection: "staff",
      data: { email: user.email, password: key },
    });
    return { user, token: token! };
  };
  const post = (token: string, input: unknown, source = origin) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: {
          authorization: "JWT " + token,
          origin: source,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "freeze-local", input }),
      }),
    );
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    for (const who of [manager, other])
      await setCampaignGrant(p, admin.user, {
        staffId: who.user.id,
        topic: "policy-updates",
        enabled: true,
      });
    const workspace = await readCampaignWorkspace(p, manager.user);
    const policies = [
      workspace.choices.find((row) => row.policies.zh && row.policies.en)!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const read = () => readCampaignFreeze(p, manager.user, input);
    assert.equal(await read(), null);
    for (const who of [undefined, admin.user, operations.user])
      await assert.rejects(readCampaignFreeze(p, who, input), { status: 403 });
    await assert.rejects(readCampaignFreeze(p, other.user, input), { status: 404 });
    for (const bad of [null, [], { ...input, counts: {} }, { ...input, owner: manager.user.id }])
      await assert.rejects(readCampaignFreeze(p, manager.user, bad), { status: 400 });
    assert.equal((await post(manager.token, input)).status, 409);
    const untested = await campaignMockChecks(p, manager.user, "status", input);
    const render = (
      status: typeof untested,
      frozen: Awaited<ReturnType<typeof readCampaignFreeze>>,
      dirty = false,
      disabled = false,
    ) =>
      renderToStaticMarkup(
        createElement(CampaignMockChecks, { draft: input, status, frozen, dirty, disabled }),
      );
    assert.match(render(untested, null), /<button[^>]*disabled=""[^>]*>冻结本轮名单（不发送）/);
    const test = await campaignMockChecks(p, manager.user, "test", input);
    assert.equal((await post(manager.token, input)).status, 409);
    const confirmed = await campaignMockChecks(p, manager.user, "confirm", {
      ...input,
      testId: test.testId,
      readable: ["zh", "en"],
    });
    assert.match(
      render(confirmed, null, true),
      /<button[^>]*disabled=""[^>]*>冻结本轮名单（不发送）/,
    );
    assert.match(
      render(confirmed, null, false, true),
      /<button[^>]*disabled=""[^>]*>冻结本轮名单（不发送）/,
    );
    assert.match(render(confirmed, null), /<div lang="en">/);
    assert.doesNotMatch(
      render(confirmed, null),
      /<button[^>]*disabled=""[^>]*>冻结本轮名单（不发送）/,
    );
    for (const locale of ["zh", "en"] as const) {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${locale}-${key}@example.invalid`,
          topic: "policy-updates",
          status: "confirmed",
          locale,
          consentVersion: 1,
          privacyVersion: key,
          sourcePath: "/en",
          consentedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
        },
      });
      subscribers.push(row.id);
    }
    for (const token of ["", admin.token, operations.token])
      assert.equal((await post(token, input)).status, 403);
    assert.equal((await post(other.token, input)).status, 404);
    assert.equal((await post(manager.token, { ...input, counts: { zh: 100 } })).status, 400);
    assert.equal((await post(manager.token, input, "https://foreign.invalid")).status, 403);
    const jobs = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    const response = await post(manager.token, input);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("x-robots-tag")!, /noindex/);
    const result = await response.json();
    assert.deepEqual(result.snapshot.counts, { zh: 1, en: 1 });
    assert.doesNotMatch(
      JSON.stringify(result),
      /email|recipient|subscription|testId|token|API_KEY/,
    );
    const frozen = await read();
    assert.ok(frozen);
    assert.equal(frozen.current, true);
    assert.equal(frozen.revision, 1);
    assert.deepEqual(frozen.counts, { zh: 1, en: 1 });
    assert.doesNotMatch(JSON.stringify(frozen), /email|recipient|subscription|API_KEY/);
    assert.match(
      render(confirmed, { ...frozen, frozenAt: "2026-11-20T00:05:00.000Z" }),
      /2026-11-20 08:05/,
    );
    assert.match(render(confirmed, frozen), /全部暂存，未发送/);
    assert.match(render(confirmed, frozen, true), /当前选择未保存/);
    assert.doesNotMatch(render(confirmed, frozen), /冻结本轮名单（不发送）<\/button>/);
    const late = await p.create({
      collection: "subscriptions",
      data: {
        email: `late-${key}@example.invalid`,
        topic: "policy-updates",
        status: "confirmed",
        locale: "en",
        consentVersion: 1,
        privacyVersion: key,
        sourcePath: "/en",
        consentedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      },
    });
    subscribers.push(late.id);
    assert.deepEqual((await (await post(manager.token, input)).json()).snapshot, result.snapshot);
    assert.deepEqual(await read(), frozen);
    assert.deepEqual((await readCampaignDraft(p, manager.user, input.campaignKey)).counts, {
      zh: 1,
      en: 2,
      excluded: 0,
    });
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    assert.equal((await post(manager.token, input)).status, 409);
    assert.deepEqual(await read(), frozen, "history is readable without a new mock proof");
    if (env.WORKFLOW_MAIL_FROM === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = env.WORKFLOW_MAIL_FROM;
    const next = await saveCampaignDraft(p, manager.user, { ...input, policies });
    const nextInput = { campaignKey: next.campaignKey, revision: next.revision };
    const history = await readCampaignFreeze(p, manager.user, nextInput);
    assert.ok(history);
    assert.equal(history.current, false);
    assert.equal(history.revision, 1);
    assert.match(render(confirmed, history), /改版续发尚未开放/);
    await assert.rejects(read(), { status: 409 });
    const newTest = await campaignMockChecks(p, manager.user, "test", nextInput);
    await campaignMockChecks(p, manager.user, "confirm", {
      ...nextInput,
      testId: newTest.testId,
      readable: ["zh", "en"],
    });
    assert.equal((await post(manager.token, nextInput)).status, 409);
    await setCampaignGrant(p, admin.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: false,
    });
    await assert.rejects(readCampaignFreeze(p, manager.user, nextInput), { status: 403 });
    assert.equal((await post(manager.token, nextInput)).status, 403);
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, jobs);
    console.log("PASS 本人名单快照页面、手动冻结、历史汇总、状态门禁、预估一致与权限隔离");
  } finally {
    await p.delete({ collection: "subscription-campaign-jobs", where: {} });
    await p.delete({ collection: "subscription-campaign-batches", where: {} });
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
    for (const variable of Object.keys(process.env))
      if (!(variable in env)) delete process.env[variable];
    Object.assign(process.env, env);
  }
}
