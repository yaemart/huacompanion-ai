import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { readCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { CampaignWorkspace } from "../../src/components/subscriptions/CampaignWorkspace";
import {
  publishFictionalMailPolicies,
  publishFictionalSharedMailPolicy,
} from "../helpers/policy-email-fixtures";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { policyMailReference } from "../../src/server/policy-subscription";

export async function testCampaignPages(p: Payload) {
  const savedPolicyFlag = process.env.VISA_CHECKER_ENABLED;
  delete process.env.VISA_CHECKER_ENABLED;
  const key = randomUUID();
  const people: number[] = [];
  const origin = new URL(process.env.APP_URL!).origin;
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: `虚构${role}${people.length}`,
        email: `${people.length}-${key}@example.invalid`,
        password: key,
        role,
        active: true,
      },
    });
    people.push(user.id);
    const { token } = await p.login({
      collection: "staff",
      data: { email: user.email, password: key },
    });
    return { user, token: token! };
  };
  const post = (
    token: string,
    action: string,
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
        body: patch.raw ?? JSON.stringify({ action, input }),
      }),
    );
  try {
    const admin = await person("admin");
    const keeper = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    const editor = await person("editor");
    const reviewer = await person("reviewer");
    const grant = { staffId: manager.user.id, topic: "policy-updates", enabled: true };
    const jobs = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    for (const who of [undefined, manager.user, operations.user, editor.user, reviewer.user])
      await assert.rejects(readCampaignWorkspace(p, who), { status: 403 });
    for (const token of ["", manager.token, operations.token, editor.token, reviewer.token])
      assert.equal((await post(token, "grant", grant)).status, 403);
    const start = await readCampaignWorkspace(p, admin.user);
    assert.equal(start.canDraft, false);
    assert.equal(start.choices.length, 0);
    assert.equal(start.campaigns.length, 0);
    assert.ok(start.grants?.some((g) => g.staffId === manager.user.id && !g.enabled));
    assert.doesNotMatch(
      JSON.stringify(start),
      /@example\.invalid|password|tokenHash|internalNotes/,
    );
    assert.equal(
      (await post(admin.token, "grant", grant, { origin: "https://elsewhere.invalid" })).status,
      403,
    );
    assert.equal((await post(admin.token, "grant", grant, { type: "text/plain" })).status, 415);
    assert.equal((await post(admin.token, "grant", grant, { raw: "x".repeat(17000) })).status, 413);
    assert.equal((await post(admin.token, "grant", grant, { raw: "{" })).status, 400);
    assert.equal(
      (
        await post(admin.token, "grant", grant, {
          raw: JSON.stringify({ action: "grant", input: grant, owner: admin.user.id }),
        })
      ).status,
      400,
    );
    assert.equal((await post(admin.token, "delete", {})).status, 400);
    assert.equal((await post(admin.token, "grant", { ...grant, enabled: "true" })).status, 400);
    assert.equal((await post(admin.token, "grant", grant)).status, 200);
    assert.equal((await readCampaignWorkspace(p, manager.user)).choices.length, 0);
    process.env.VISA_CHECKER_ENABLED = "true";
    const workspace = await readCampaignWorkspace(p, manager.user);
    assert.equal(workspace.canDraft, true);
    assert.equal(workspace.grants, null);
    assert.ok(workspace.choices.length);
    assert.doesNotMatch(
      JSON.stringify(workspace),
      /@example\.invalid|password|TEST PRIVATE|internalNotes|verifiedBy/,
    );
    const policies = [workspace.choices[0].policies];
    const saved = await post(manager.token, "save", { policies });
    assert.equal(saved.status, 200);
    assert.match(saved.headers.get("cache-control")!, /no-store/);
    assert.match(saved.headers.get("x-robots-tag")!, /noindex/);
    const { campaignKey } = await saved.json();
    const first = await readCampaignDraft(p, manager.user, campaignKey);
    assert.deepEqual(first.policies, policies);
    assert.equal(first.revision, 1);
    const resumed = await readCampaignWorkspace(p, manager.user);
    assert.equal(resumed.campaigns.length, 1);
    assert.equal(resumed.campaigns[0].campaignKey, campaignKey);
    const render = (workspace: typeof start, draft?: typeof first) =>
      renderToStaticMarkup(createElement(CampaignWorkspace, { workspace, draft }));
    const adminHTML = render(start);
    assert.match(adminHTML, /主题授权管理/);
    assert.match(adminHTML, /当前账号尚未获活动操作授权/);
    const html = render(resumed, first);
    assert.doesNotMatch(html, /主题授权管理|staffId|@example\.invalid|TEST PRIVATE/);
    assert.match(html, /中英文预览/);
    assert.match(html, /checked=""/);
    assert.match(html, /第 1 版/);
    assert.match(html, /人数为预估/);
    assert.match(html, /仅保存草稿/);
    assert.doesNotMatch(html, /<button[^>]*>\s*(发送|确认发送|测试发送)/);
    assert.match(render(resumed, { ...first, current: false }), /来源已变化/);
    assert.match(
      render(resumed, { ...first, preview: { ...first.preview, en: null } }),
      /该语言资料未齐备/,
    );
    assert.equal(
      (await post(manager.token, "save", { campaignKey, revision: 1, policies })).status,
      200,
    );
    assert.equal((await readCampaignDraft(p, manager.user, campaignKey)).revision, 2);
    assert.equal(
      (await post(manager.token, "save", { campaignKey, revision: 1, policies })).status,
      409,
    );
    assert.equal((await post(admin.token, "save", { policies })).status, 403);
    assert.equal(
      (await post(admin.token, "grant", { ...grant, staffId: other.user.id })).status,
      200,
    );
    assert.equal((await readCampaignWorkspace(p, other.user)).campaigns.length, 0);
    await assert.rejects(readCampaignDraft(p, other.user, campaignKey), { status: 404 });
    assert.equal(
      (await post(other.token, "save", { campaignKey, revision: 2, policies })).status,
      404,
    );
    assert.equal((await post(manager.token, "grant", grant)).status, 403);
    assert.equal((await post(admin.token, "grant", { ...grant, enabled: false })).status, 200);
    await assert.rejects(readCampaignWorkspace(p, manager.user), { status: 403 });
    assert.equal((await post(manager.token, "save", { policies })).status, 403);
    const active = await p.db.pool.query<{ id: number; version: number }>(
      "SELECT id, active_fact_version_id AS version FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
    );
    const legacy = await publishFictionalMailPolicies(p, "zh");
    try {
      await p.db.pool.query("UPDATE policy_groups SET active_fact_version_id=NULL");
      assert.ok(
        (await listPublicPolicies(p, "zh")).length,
        "legacy published policy stays publicly readable",
      );
      const oldWorkspace = await readCampaignWorkspace(p, other.user);
      assert.equal(
        oldWorkspace.choices.length,
        0,
        "do not offer legacy policies that cannot save as campaigns",
      );
    } finally {
      for (const record of legacy)
        await p.delete({ collection: "content-published", id: record.id });
      for (const group of active.rows)
        await p.db.pool.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          group.version,
          group.id,
        ]);
    }
    const target = (await listPublicPolicies(p, "zh")).find(
      (policy) => policyMailReference("zh", policy) === policies[0].zh,
    );
    assert.ok(target);
    const duplicate = await publishFictionalSharedMailPolicy(p, target, `duplicate-${key}`);
    try {
      assert.ok(
        !(await readCampaignWorkspace(p, other.user)).choices.some(
          (choice) => choice.key === workspace.choices[0].key,
        ),
        "ambiguous identical published facts must not be offered",
      );
    } finally {
      await p.update({
        collection: "policy-groups",
        id: duplicate.group,
        data: { activeFactVersion: null },
      });
    }
    await p.update({
      collection: "staff",
      id: admin.user.id,
      user: keeper.user,
      data: { active: false },
    });
    assert.equal((await post(admin.token, "grant", grant)).status, 403);
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, jobs);
    console.log("PASS 群发后台授权、本人草稿操作流程、同源防护、撤权和预览隐私");
  } finally {
    if (savedPolicyFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
    else process.env.VISA_CHECKER_ENABLED = savedPolicyFlag;
    await p.delete({
      collection: "subscription-campaign-drafts",
      where: { owner: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-grants",
      where: { staff: { in: people } },
    });
    for (const id of people) await p.delete({ collection: "staff", id });
  }
}
