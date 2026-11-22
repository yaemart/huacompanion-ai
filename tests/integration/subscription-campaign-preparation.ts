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
import { readMockCampaignBudget } from "../../src/server/subscription-campaign-quota";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignPreparation(p: Payload, url: URL) {
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
        name: "虚构准备测试",
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
          patch.raw ?? JSON.stringify({ action: patch.action ?? "read-mock-budget-local", input }),
      }),
    );
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin");
    const keeper = await person("admin");
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
    const read = () => readMockCampaignBudget(p, admin.user, {});
    const empty = await read();
    assert.equal(empty.id, null);
    assert.equal(empty.valid, false);
    assert.equal(empty.remaining, null);
    for (const action of ["read-mock-budget-local", "set-mock-budget-local"]) {
      const value = action.startsWith("read") ? {} : { remaining: 2, reason: "虚构余额" };
      for (const token of [
        "",
        manager.token,
        other.token,
        operations.token,
        editor.token,
        reviewer.token,
      ])
        assert.equal((await post(token, value, { action })).status, 403);
      assert.equal(
        (await post(admin.token, value, { action, origin: "https://elsewhere.invalid" })).status,
        403,
      );
      assert.equal((await post(admin.token, value, { action, type: "text/plain" })).status, 415);
      assert.equal(
        (await post(admin.token, value, { action, raw: "x".repeat(17000) })).status,
        413,
      );
      assert.equal(
        (await post(admin.token, { ...value, actor: manager.user.id }, { action })).status,
        400,
      );
      process.env.APP_ENV = "trial";
      assert.equal((await post(admin.token, value, { action })).status, 403);
      process.env.APP_ENV = "local";
    }
    for (const value of [
      null,
      [],
      { remaining: -1, reason: "x" },
      { remaining: 2001, reason: "x" },
      { remaining: 0.1, reason: "x" },
      { remaining: "2", reason: "x" },
      { remaining: 2, reason: " " },
      { remaining: 2, reason: "x".repeat(501) },
    ])
      assert.equal(
        (await post(admin.token, value, { action: "set-mock-budget-local" })).status,
        400,
      );
    const set = async (remaining: number) => {
      const response = await post(
        admin.token,
        { remaining, reason: "虚构准备余额" },
        { action: "set-mock-budget-local" },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      return (await response.json()).budget;
    };
    const configured = await set(2);
    assert.equal(configured.remaining, 2);
    assert.ok(Date.parse(configured.expiresAt) > Date.now() + 3590000);
    const beforeRead = await databaseFingerprints(db);
    const snapshot = await read();
    assert.equal(snapshot.configured, 2);
    assert.equal(snapshot.remaining, 2);
    assert.equal(snapshot.valid, true);
    assert.equal(snapshot.reason, "虚构准备余额");
    assert.equal(snapshot.id, configured.id);
    const readResponse = await post(admin.token, {});
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).budget.id, configured.id);
    assert.deepEqual(
      await databaseFingerprints(db),
      beforeRead,
      "budget reads never reset usage or repeat a setting",
    );
    assert.doesNotMatch(JSON.stringify(snapshot), /recipient|email|hash|token|password|actor/i);
    const markup = renderToStaticMarkup(
      createElement(CampaignWorkspace, {
        workspace: await readCampaignWorkspace(p, admin.user),
        preparationBudget: snapshot,
      }),
    );
    assert.match(markup, /本地模拟余额与占位准备/);
    assert.match(markup, /设置虚构余额/);
    const managerMarkup = renderToStaticMarkup(
      createElement(CampaignWorkspace, { workspace: await readCampaignWorkspace(p, manager.user) }),
    );
    assert.doesNotMatch(managerMarkup, /设置虚构余额/);
    const policies = [
      (await readCampaignWorkspace(p, manager.user)).choices.find(
        (r) => r.policies.zh && r.policies.en,
      )!.policies,
    ];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const prepare = async (value = input) => {
      const test = await campaignMockChecks(p, manager.user, "test", value);
      await campaignMockChecks(p, manager.user, "confirm", {
        ...value,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    await prepare();
    const reserveInput = { ...input, key: randomUUID() };
    for (const token of ["", admin.token, operations.token, editor.token, reviewer.token])
      assert.equal(
        (await post(token, reserveInput, { action: "reserve-mock-slot-local" })).status,
        403,
      );
    assert.equal(
      (await post(other.token, reserveInput, { action: "reserve-mock-slot-local" })).status,
      404,
    );
    assert.equal(
      (await post(manager.token, reserveInput, { action: "reserve-mock-slot-local" })).status,
      409,
    );
    for (const value of [
      null,
      [],
      {},
      { ...reserveInput, key: "bad" },
      { ...reserveInput, owner: other.user.id },
      { ...reserveInput, recipient: key },
    ])
      assert.equal(
        (await post(manager.token, value, { action: "reserve-mock-slot-local" })).status,
        400,
      );
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
    await freezeCampaignRecipients(p, manager.user, input);
    const reserve = async (requestKey = reserveInput.key, value = input) => {
      const response = await post(
        manager.token,
        { ...value, key: requestKey },
        { action: "reserve-mock-slot-local" },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.match(response.headers.get("x-robots-tag")!, /noindex/);
      return (await response.json()).reservation;
    };
    await db.query(`CREATE FUNCTION reject_preparation_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action IN ('set-mock-budget','reserve-mock-slot') THEN RAISE EXCEPTION 'reject preparation audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_preparation_commit AFTER INSERT ON audit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_preparation_commit();`);
    try {
      const before = await databaseFingerprints(db);
      assert.equal(
        (
          await post(
            admin.token,
            { remaining: 4, reason: "虚构" },
            { action: "set-mock-budget-local" },
          )
        ).status,
        503,
      );
      assert.equal(
        (await post(manager.token, reserveInput, { action: "reserve-mock-slot-local" })).status,
        503,
      );
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query(
        "DROP TRIGGER reject_preparation_commit ON audit_events; DROP FUNCTION reject_preparation_commit()",
      );
    }
    const reservations = await Promise.all([
      reserve(),
      reserve(),
      reserve(randomUUID()),
      reserve(randomUUID()),
    ]);
    assert.equal(reservations.filter((r) => r.state === "reserved-local").length, 2);
    assert.equal(reservations.filter((r) => r.state === "already-reserved").length, 1);
    assert.equal(reservations.filter((r) => r.state === "budget-exhausted").length, 1);
    assert.equal((await read()).remaining, 0);
    const beforeReplay = await databaseFingerprints(db);
    assert.equal((await reserve()).state, "already-reserved");
    assert.deepEqual(await databaseFingerprints(db), beforeReplay);
    await set(1);
    assert.equal((await reserve(randomUUID())).state, "reserved-local");
    const otherDraft = await saveCampaignDraft(p, manager.user, { policies });
    const otherInput = { campaignKey: otherDraft.campaignKey, revision: otherDraft.revision };
    await prepare(otherInput);
    await freezeCampaignRecipients(p, manager.user, otherInput);
    await set(10);
    assert.equal((await reserve(randomUUID(), otherInput)).state, "email-limit");
    assert.equal(
      (
        await post(
          manager.token,
          { ...otherInput, key: reserveInput.key },
          { action: "reserve-mock-slot-local" },
        )
      ).status,
      409,
    );
    await set(0);
    assert.equal((await reserve(randomUUID())).state, "budget-exhausted");
    await set(1);
    await db.query(
      "UPDATE subscription_campaign_mock_budgets SET expires_at=statement_timestamp() WHERE id=(SELECT max(id) FROM subscription_campaign_mock_budgets)",
    );
    const expired = await read();
    assert.equal(expired.valid, false);
    assert.equal(expired.remaining, null);
    assert.equal((await reserve(randomUUID())).state, "budget-unavailable");
    await set(2);
    await setCampaignPause(p, manager.user, { ...input, paused: true, reason: "虚构暂停" });
    assert.equal(
      (
        await post(
          manager.token,
          { ...input, key: randomUUID() },
          { action: "reserve-mock-slot-local" },
        )
      ).status,
      409,
    );
    await setCampaignPause(p, manager.user, { ...input, paused: false, reason: "虚构恢复" });
    process.env.APP_ENV = "trial";
    assert.equal(
      (await post(manager.token, reserveInput, { action: "reserve-mock-slot-local" })).status,
      403,
    );
    process.env.APP_ENV = "local";
    await cancelMockCampaign(p, manager.user, { ...input, reason: "虚构取消" });
    assert.equal(
      (await post(manager.token, reserveInput, { action: "reserve-mock-slot-local" })).status,
      409,
    );
    await p.update({
      collection: "staff",
      id: admin.user.id,
      user: keeper.user,
      data: { additionalRoles: [], role: "operations" },
    });
    assert.equal((await post(admin.token, {})).status, 403);
    console.log("PASS 本地余额核对设置与任务占位接口、权限额度、幂等竞争及审计回滚");
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
