import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { Payload } from "payload";
import pg from "pg";
import {
  setCampaignGrant,
  requireCampaignGrant,
} from "../../src/server/subscription-campaign-access";
import { GET as manage } from "../../src/app/(frontend)/api/subscriptions/manage/route";
import { POST as download } from "../../src/app/(frontend)/api/subscriptions/export/route";

export async function testCampaignAccess(payload: Payload, url: URL) {
  const key = randomUUID();
  const people: number[] = [];
  const topic = "policy-updates" as const;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const person = async (
    role: "admin" | "manager" | "operations" | "editor" | "reviewer",
    additionalRoles: "manager"[] = [],
  ) => {
    const user = await payload.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构群发权限验收",
        email: `campaign-${people.length}-${key}@example.invalid`,
        role,
        additionalRoles,
        active: true,
        password: key,
      },
    });
    people.push(user.id);
    return user;
  };
  try {
    const admin = await person("admin");
    const keeper = await person("admin");
    const manager = await person("manager");
    const operations = await person("operations");
    const editor = await person("editor");
    const reviewer = await person("reviewer");
    const compatible = await person("operations", ["manager"]);
    const input = { staffId: manager.id, topic, enabled: true };
    for (const user of [undefined, admin, manager, operations, editor, reviewer, compatible])
      await assert.rejects(requireCampaignGrant(payload, user, topic), { status: 403 });
    for (const user of [
      undefined,
      manager,
      operations,
      editor,
      reviewer,
      compatible,
      { ...operations, role: "admin" },
    ])
      await assert.rejects(setCampaignGrant(payload, user, input), { status: 403 });
    for (const invalid of [
      { ...input, topic: "sourcing-guides" },
      { ...input, staffId: -1 },
      { ...input, staffId: 1.5 },
      { ...input, enabled: "true" },
      { ...input, revision: 99 },
      null,
      [],
    ])
      await assert.rejects(setCampaignGrant(payload, admin, invalid as unknown as typeof input), {
        status: 400,
      });
    for (const user of [operations, editor, reviewer])
      await assert.rejects(setCampaignGrant(payload, admin, { ...input, staffId: user.id }), {
        status: 403,
      });
    const first = await setCampaignGrant(payload, admin, input);
    assert.equal(first.revision, 1);
    const same = await Promise.all(
      Array.from({ length: 8 }, () => setCampaignGrant(payload, admin, input)),
    );
    assert.ok(same.every((grant) => grant.id === first.id && grant.revision === 1));
    const auditWhere = {
      entity: { equals: "subscription-campaign-grants" },
      recordId: { equals: String(first.id) },
    };
    assert.equal(
      (await payload.count({ collection: "audit-events", where: auditWhere })).totalDocs,
      1,
    );
    assert.deepEqual(await requireCampaignGrant(payload, manager, topic), {
      actorId: manager.id,
      grantId: first.id,
      grantRevision: 1,
      topic,
    });
    const login = await payload.login({
      collection: "staff",
      data: { email: manager.email, password: key },
    });
    const origin = new URL(process.env.APP_URL!).origin;
    const headers = {
      origin,
      authorization: "JWT " + login.token,
      "content-type": "application/json",
    };
    assert.equal(
      (await manage(new Request(origin + "/api/subscriptions/manage", { headers }))).status,
      403,
    );
    assert.equal(
      (
        await download(
          new Request(origin + "/api/subscriptions/export", {
            method: "POST",
            headers,
            body: "{}",
          }),
        )
      ).status,
      403,
    );
    const revoked = await setCampaignGrant(payload, admin, { ...input, enabled: false });
    assert.equal(revoked.revision, 2);
    await assert.rejects(requireCampaignGrant(payload, manager, topic), { status: 403 });
    const restored = await setCampaignGrant(payload, admin, input);
    assert.equal(restored.revision, 3);
    assert.equal((await requireCampaignGrant(payload, manager, topic)).grantRevision, 3);
    const audits = await payload.find({
      collection: "audit-events",
      where: auditWhere,
      sort: "id",
      depth: 0,
    });
    assert.deepEqual(
      audits.docs.map((event) => event.action),
      ["grant", "revoke", "grant"],
    );
    assert.deepEqual(audits.docs[1].after, {
      staffId: manager.id,
      topic,
      enabled: false,
      revision: 2,
    });
    assert.equal(audits.docs[1].actor, admin.id);
    assert.doesNotMatch(JSON.stringify(audits.docs), /@example\.invalid|password|tokenHash/);
    await setCampaignGrant(payload, admin, { ...input, staffId: compatible.id });
    assert.equal((await requireCampaignGrant(payload, compatible, topic)).actorId, compatible.id);
    await setCampaignGrant(payload, admin, { ...input, staffId: admin.id });
    assert.equal((await requireCampaignGrant(payload, admin, topic)).actorId, admin.id);
    await assert.rejects(
      requireCampaignGrant(payload, { ...manager, collection: "customers" }, topic),
      { status: 403 },
    );
    await payload.update({
      collection: "staff",
      id: manager.id,
      user: keeper,
      data: { active: false },
    });
    await assert.rejects(requireCampaignGrant(payload, manager, topic), { status: 403 });
    await assert.rejects(setCampaignGrant(payload, admin, input), { status: 403 });
    await setCampaignGrant(payload, admin, { ...input, enabled: false });
    await payload.update({
      collection: "staff",
      id: manager.id,
      user: keeper,
      data: { active: true, role: "operations" },
    });
    await assert.rejects(requireCampaignGrant(payload, { ...manager, role: "admin" }, topic), {
      status: 403,
    });
    await payload.update({
      collection: "staff",
      id: admin.id,
      user: keeper,
      data: { active: false },
    });
    await assert.rejects(setCampaignGrant(payload, admin, { ...input, enabled: false }), {
      status: 403,
    });
    await payload.update({
      collection: "staff",
      id: admin.id,
      user: keeper,
      data: { active: true },
    });

    const racer = await person("manager");
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(726281)");
    await db.query("UPDATE staff SET active=false WHERE id=$1", [racer.id]);
    const waiting = assert.rejects(
      setCampaignGrant(payload, admin, { ...input, staffId: racer.id }),
      { status: 403 },
    );
    try {
      let blocked = false;
      for (let i = 0; i < 50; i++) {
        const locks = await db.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=726281 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
        );
        if (locks.rowCount) {
          blocked = true;
          break;
        }
        await setTimeout(20);
      }
      assert.equal(blocked, true, "grant changes serialize with employee changes");
    } finally {
      await db.query("COMMIT");
      await waiting;
    }
    assert.equal(
      (
        await payload.count({
          collection: "subscription-campaign-grants",
          where: { staff: { equals: racer.id } },
        })
      ).totalDocs,
      0,
    );
    const doomed = await person("manager");
    await db.query(`
      CREATE FUNCTION reject_campaign_grant_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscription-campaign-grants' THEN RAISE EXCEPTION 'fixture rejects grant audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_campaign_grant_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_campaign_grant_commit();
    `);
    try {
      await assert.rejects(setCampaignGrant(payload, admin, { ...input, staffId: doomed.id }), {
        status: 503,
      });
      assert.equal(
        (
          await payload.count({
            collection: "subscription-campaign-grants",
            where: { staff: { equals: doomed.id } },
          })
        ).totalDocs,
        0,
      );
      await assert.rejects(requireCampaignGrant(payload, doomed, topic), { status: 403 });
    } finally {
      await db.query(
        "DROP TRIGGER reject_campaign_grant_commit ON audit_events; DROP FUNCTION reject_campaign_grant_commit()",
      );
    }
    console.log("PASS 群发独立授权、版本撤销、当前角色、审计原子性、并发停用和邮箱权限隔离");
  } finally {
    await db.query("ROLLBACK");
    if (people.length)
      await payload.delete({
        collection: "subscription-campaign-grants",
        where: { staff: { in: people } },
      });
    for (const id of people) await payload.delete({ collection: "staff", id });
    await db.end();
  }
}
