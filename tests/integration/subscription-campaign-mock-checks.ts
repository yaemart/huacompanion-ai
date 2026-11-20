import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { handleEndpoints, type Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261120_130000_subscription_campaign_checks";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import { saveCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { POST } from "../../src/app/(frontend)/api/subscriptions/campaigns/route";
import { CampaignMockChecks } from "../../src/components/subscriptions/CampaignMockChecks";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { policyMailReference } from "../../src/server/policy-subscription";

export async function testCampaignMockChecks(p: Payload, url: URL) {
  const env = { ...process.env };
  const key = randomUUID();
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const people: number[] = [];
  const person = async (role: "admin" | "manager" | "operations") => {
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: `虚构模拟${role}${people.length}`,
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
  const adapter = { db: { execute: (statement: string) => db.query(statement) } };
  const origin = new URL(process.env.APP_URL!).origin;
  const post = (token: string, action: string, input: unknown, source = origin) =>
    POST(
      new Request(origin + "/api/subscriptions/campaigns", {
        method: "POST",
        headers: {
          origin: source,
          authorization: "JWT " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ action, input }),
      }),
    );
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    const admin = await person("admin");
    const manager = await person("manager");
    const other = await person("manager");
    const operations = await person("operations");
    const topic = "policy-updates" as const;
    for (const who of [manager, other])
      await setCampaignGrant(p, admin.user, { staffId: who.user.id, topic, enabled: true });
    const workspace = await readCampaignWorkspace(p, manager.user);
    const publicPolicies = await listPublicPolicies(p, "zh");
    const factOnly = publicPolicies.find((policy) => !policy.publicNotes);
    assert.ok(factOnly);
    const choice = workspace.choices.find(
      (item) => item.policies.zh === policyMailReference("zh", factOnly),
    );
    assert.ok(choice);
    const policies = [choice.policies];
    const draft = await saveCampaignDraft(p, manager.user, { policies });
    const input = { campaignKey: draft.campaignKey, revision: draft.revision };
    const read = () => campaignMockChecks(p, manager.user, "status", input);
    const test = () => campaignMockChecks(p, manager.user, "test", input);
    const confirm = (testId: number, readable = ["zh", "en"]) =>
      campaignMockChecks(p, manager.user, "confirm", { ...input, testId, readable });
    const jobs = (await p.count({ collection: "subscription-mail-jobs" })).totalDocs;
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await down(adapter as unknown as MigrateDownArgs);
      await up(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const user of [undefined, admin.user, manager.user, other.user, operations.user]) {
      const scope = {
        collection: "subscription-campaign-checks" as const,
        user,
        overrideAccess: false,
      };
      await assert.rejects(p.find(scope), { status: 403 });
      await assert.rejects(
        p.create({
          ...scope,
          data: {
            draft: 1,
            kind: "mock-test",
            binding: key,
            contextHash: key,
            actor: manager.user.id,
            languages: ["zh"],
          },
        }),
        { status: 403 },
      );
    }
    assert.equal(
      (
        await handleEndpoints({
          config,
          request: new Request(origin + "/api/subscription-campaign-checks"),
        })
      ).status,
      501,
    );
    for (const who of [
      undefined,
      admin.user,
      operations.user,
      { ...operations.user, role: "manager" },
    ])
      await assert.rejects(campaignMockChecks(p, who, "test", input), { status: 403 });
    await assert.rejects(campaignMockChecks(p, other.user, "test", input), { status: 404 });
    for (const invalid of [
      null,
      [],
      {},
      { ...input, preview: "forged" },
      { ...input, revision: 0 },
      { ...input, testId: 1 },
    ])
      await assert.rejects(
        campaignMockChecks(p, manager.user, "test", invalid),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "status" in error &&
          [400, 409].includes(Number(error.status)),
      );
    assert.equal((await read()).tested, false);
    await assert.rejects(confirm(1), { status: 409 });
    const first = await test();
    assert.equal(first.tested, true);
    assert.equal(first.mockConfirmed, false);
    assert.ok(first.testId);
    assert.equal(first.messages.length, 2);
    assert.ok(first.messages.every((m) => m.to === "preview@example.invalid"));
    assert.match(first.messages[0].body, /官方来源/);
    assert.match(first.messages[1].body, /Official source/);
    assert.doesNotMatch(
      JSON.stringify(first),
      /WORKFLOW_MAIL|API_KEY|TEST PRIVATE|binding|password|tokenHash/,
    );
    await assert.rejects(confirm(first.testId, ["zh"]), { status: 400 });
    await assert.rejects(confirm(first.testId, ["zh", "en", "fr"]), { status: 400 });
    await assert.rejects(confirm(first.testId, ["zh", "zh"]), { status: 400 });
    const tested = await Promise.all(Array.from({ length: 5 }, test));
    assert.ok(tested.every((item) => item.testId === first.testId));
    const confirmed = await Promise.all(Array.from({ length: 5 }, () => confirm(first.testId!)));
    assert.ok(confirmed.every((item) => item.mockConfirmed));
    const rows = await p.find({ collection: "subscription-campaign-checks", depth: 0 });
    assert.equal(rows.totalDocs, 2);
    await assert.rejects(
      db.query(`INSERT INTO subscription_campaign_checks(draft_id,kind,binding,context_hash,actor_id,languages,test_id)
      SELECT draft_id,kind,binding,context_hash,actor_id,languages,test_id FROM subscription_campaign_checks LIMIT 1`),
      /duplicate key/,
    );
    for (const user of [undefined, admin.user, manager.user, operations.user]) {
      await assert.rejects(
        p.update({
          collection: "subscription-campaign-checks",
          id: rows.docs[0].id,
          user,
          overrideAccess: false,
          data: { languages: [] },
        }),
        { status: 403 },
      );
      await assert.rejects(
        p.delete({
          collection: "subscription-campaign-checks",
          id: rows.docs[0].id,
          user,
          overrideAccess: false,
        }),
        { status: 403 },
      );
    }
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve campaign checks/);
    } finally {
      await db.query("ROLLBACK");
    }
    const render = (status: typeof first, dirty = false) =>
      renderToStaticMarkup(createElement(CampaignMockChecks, { draft, status, dirty }));
    assert.match(render(first), /未实际发送/);
    assert.match(render(first), /确认中文模拟邮件可读/);
    assert.match(render(first), /确认英文模拟邮件可读/);
    assert.match(render(confirmed[0]), /已完成本地模拟确认/);
    assert.match(render(first, true), /请先保存修改/);
    assert.match(render(first, true), /<button[^>]*disabled=""[^>]*>生成本地模拟邮件/);
    assert.doesNotMatch(render(confirmed[0], true), /已完成本地模拟确认/);
    const api = await post(manager.token, "mock-test", input);
    assert.equal(api.status, 200);
    assert.match(api.headers.get("cache-control")!, /no-store/);
    assert.equal(
      (
        await post(manager.token, "mock-confirm", {
          ...input,
          testId: first.testId,
          readable: ["zh", "en"],
        })
      ).status,
      200,
    );
    assert.equal(
      (await post(manager.token, "mock-test", input, "https://elsewhere.invalid")).status,
      403,
    );
    assert.equal((await post(other.token, "mock-test", input)).status, 404);
    assert.equal((await post(operations.token, "mock-confirm", input)).status, 403);
    const beforeConfig = process.env.WORKFLOW_MAIL_FROM;
    process.env.WORKFLOW_MAIL_FROM = "changed@example.invalid";
    await assert.rejects(confirm(first.testId), { status: 409 });
    assert.equal((await read()).tested, false);
    assert.equal((await read()).mockConfirmed, false);
    await assert.rejects(confirm(first.testId), { status: 409 });
    if (beforeConfig === undefined) delete process.env.WORKFLOW_MAIL_FROM;
    else process.env.WORKFLOW_MAIL_FROM = beforeConfig;
    assert.equal(
      (await read()).tested,
      false,
      "restoring sender configuration must not revive old test",
    );
    assert.equal(
      (await read()).mockConfirmed,
      false,
      "restoring sender configuration must not revive confirmation",
    );
    await assert.rejects(confirm(first.testId), { status: 409 });
    const retested = await test();
    assert.notEqual(retested.testId, first.testId);
    assert.equal((await confirm(retested.testId!)).mockConfirmed, true);
    const originalKey = process.env.WORKFLOW_MAIL_API_KEY;
    process.env.WORKFLOW_MAIL_API_KEY = "different-fictional-key";
    assert.equal((await read()).tested, false);
    if (originalKey === undefined) delete process.env.WORKFLOW_MAIL_API_KEY;
    else process.env.WORKFLOW_MAIL_API_KEY = originalKey;
    const settings = await p.findGlobal({ slug: "workflow-settings" });
    try {
      await p.updateGlobal({
        slug: "workflow-settings",
        data: { emailEnabled: !settings.emailEnabled },
      });
      assert.equal((await read()).tested, false, "mail settings changes invalidate prior checks");
    } finally {
      await p.updateGlobal({
        slug: "workflow-settings",
        data: { emailEnabled: settings.emailEnabled },
      });
    }
    await setCampaignGrant(p, admin.user, { staffId: manager.user.id, topic, enabled: false });
    await assert.rejects(read(), { status: 403 });
    await setCampaignGrant(p, admin.user, { staffId: manager.user.id, topic, enabled: true });
    assert.equal((await read()).tested, false);
    await assert.rejects(confirm(first.testId), { status: 409 });
    await test();
    const next = await saveCampaignDraft(p, manager.user, { ...input, policies });
    await assert.rejects(test(), { status: 409 });
    const nextInput = { campaignKey: next.campaignKey, revision: next.revision };
    assert.equal((await campaignMockChecks(p, manager.user, "status", nextInput)).tested, false);
    const fact = await db.query<{ id: number; fact: number }>(
      "SELECT g.id,g.active_fact_version_id AS fact FROM policy_groups g JOIN policy_fact_versions f ON f.id=g.active_fact_version_id WHERE f.facts->>'officialSourceUrl'=$1",
      [factOnly.officialSourceUrl],
    );
    assert.equal(fact.rows.length, 1);
    const source = fact.rows[0];
    await campaignMockChecks(p, manager.user, "test", nextInput);
    const newVersion = await db.query<{ id: number }>(
      `INSERT INTO policy_fact_versions(group_id,revision,facts,source_revision,approved_by,contributors)
      SELECT group_id,(SELECT max(revision)+1 FROM policy_fact_versions WHERE group_id=$1),facts,source_revision,approved_by,contributors
      FROM policy_fact_versions WHERE id=$2 RETURNING id`,
      [source.id, source.fact],
    );
    try {
      await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
        newVersion.rows[0].id,
        source.id,
      ]);
      const unchanged = (await listPublicPolicies(p, "zh")).find(
        (policy) => policy.officialSourceUrl === factOnly.officialSourceUrl,
      );
      assert.deepEqual(
        unchanged,
        factOnly,
        "formal version changed while public content is identical",
      );
      const stale = await campaignMockChecks(p, manager.user, "status", nextInput);
      assert.equal(stale.tested, false);
      assert.equal(stale.mockConfirmed, false);
      await assert.rejects(
        campaignMockChecks(p, manager.user, "confirm", {
          ...nextInput,
          testId: first.testId,
          readable: ["zh", "en"],
        }),
        { status: 409 },
      );
    } finally {
      await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
        source.fact,
        source.id,
      ]);
    }
    // Force every selected formal source to be withdrawn, without mutating an immutable version.
    const active = await db.query<{ id: number; fact: number }>(
      "SELECT id,active_fact_version_id AS fact FROM policy_groups WHERE active_fact_version_id IS NOT NULL",
    );
    await campaignMockChecks(p, manager.user, "test", nextInput);
    try {
      await db.query("UPDATE policy_groups SET active_fact_version_id=NULL");
      assert.equal((await campaignMockChecks(p, manager.user, "status", nextInput)).tested, false);
      await assert.rejects(campaignMockChecks(p, manager.user, "test", nextInput), { status: 409 });
    } finally {
      for (const row of active.rows)
        await db.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
          row.fact,
          row.id,
        ]);
    }
    const zhDraft = await saveCampaignDraft(p, manager.user, {
      policies: [{ zh: policies[0].zh }],
    });
    const zhInput = { campaignKey: zhDraft.campaignKey, revision: zhDraft.revision };
    const zhTest = await campaignMockChecks(p, manager.user, "test", zhInput);
    assert.equal(zhTest.messages.length, 1);
    assert.equal(
      (
        await campaignMockChecks(p, manager.user, "confirm", {
          ...zhInput,
          testId: zhTest.testId,
          readable: ["zh"],
        })
      ).mockConfirmed,
      true,
    );
    process.env.APP_ENV = "trial";
    assert.equal((await campaignMockChecks(p, manager.user, "status", nextInput)).enabled, false);
    await assert.rejects(campaignMockChecks(p, manager.user, "test", nextInput), { status: 403 });
    process.env.APP_ENV = "local";
    const doomed = await saveCampaignDraft(p, manager.user, { policies });
    const doomedInput = { campaignKey: doomed.campaignKey, revision: doomed.revision };
    await db.query(`CREATE FUNCTION reject_campaign_check_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-checks' THEN RAISE EXCEPTION 'fixture rejects mock audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_campaign_check_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_campaign_check_commit();`);
    const count = (await p.count({ collection: "subscription-campaign-checks" })).totalDocs;
    try {
      await assert.rejects(campaignMockChecks(p, manager.user, "test", doomedInput), {
        status: 503,
      });
      assert.equal(
        (await p.count({ collection: "subscription-campaign-checks" })).totalDocs,
        count,
      );
    } finally {
      await db.query(
        "DROP TRIGGER reject_campaign_check_commit ON audit_events; DROP FUNCTION reject_campaign_check_commit()",
      );
    }
    assert.equal((await p.count({ collection: "subscription-mail-jobs" })).totalDocs, jobs);
    const audits = await p.find({
      collection: "audit-events",
      where: { entity: { equals: "subscription-campaign-checks" } },
      depth: 0,
      pagination: false,
    });
    assert.doesNotMatch(
      JSON.stringify(audits.docs),
      /API_KEY|different-fictional-key|preview@example|TEST PRIVATE/,
    );
    console.log("PASS 活动模拟邮件、逐语言确认、来源与配置失效、权限、幂等和审计回滚");
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
    await p.delete({
      collection: "subscription-campaign-checks",
      where: { and: [{ actor: { in: people } }, { kind: { equals: "mock-confirm" } }] },
    });
    await p.delete({
      collection: "subscription-campaign-checks",
      where: { actor: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-drafts",
      where: { owner: { in: people } },
    });
    await p.delete({
      collection: "subscription-campaign-grants",
      where: { staff: { in: people } },
    });
    for (const id of people) await p.delete({ collection: "staff", id });
    await db.end();
  }
}
