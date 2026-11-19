import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { handleEndpoints, type Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261120_090000_subscription_campaign_grants";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testSubscriptionCampaignGrants(payload: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const people: number[] = [];
  const key = randomUUID();
  const adapter = { db: { execute: (statement: string) => db.query(statement) } };
  try {
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_campaign_grants")).rows[0].n,
      0,
    );
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await down(adapter as unknown as MigrateDownArgs);
      assert.deepEqual(
        await databaseFingerprints(db),
        before.filter((row) => row.table !== "subscription_campaign_grants"),
      );
      await up(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const role of ["admin", "manager", "operations", "editor", "reviewer"] as const) {
      const who = await payload.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: {
          name: "虚构群发授权验收",
          email: `grant-${role}-${key}@example.invalid`,
          role,
          active: true,
          password: key,
        },
      });
      people.push(who.id);
      await assert.rejects(
        payload.find({
          collection: "subscription-campaign-grants",
          overrideAccess: false,
          user: who,
        }),
        { status: 403 },
      );
      await assert.rejects(
        payload.create({
          collection: "subscription-campaign-grants",
          overrideAccess: false,
          user: who,
          data: { staff: who.id, topic: "policy-updates", revision: 1, enabled: true },
        }),
        { status: 403 },
      );
    }
    const inserted = await db.query<{ id: number }>(
      "INSERT INTO subscription_campaign_grants(staff_id,topic,revision) VALUES ($1,'policy-updates',1) RETURNING id",
      [people[1]],
    );
    const record = await payload.findByID({
      collection: "subscription-campaign-grants",
      id: inserted.rows[0].id,
    });
    assert.equal(record.enabled, false, "creating a record does not silently enable broadcasting");
    await assert.rejects(
      payload.create({
        collection: "subscription-campaign-grants",
        data: { staff: people[1], topic: "policy-updates", revision: 1, enabled: true },
      }),
    );
    for (const id of people) {
      const user = await payload.findByID({ collection: "staff", id });
      await assert.rejects(
        payload.update({
          collection: "subscription-campaign-grants",
          id: record.id,
          overrideAccess: false,
          user,
          data: { enabled: true },
        }),
        { status: 403 },
      );
      await assert.rejects(
        payload.delete({
          collection: "subscription-campaign-grants",
          id: record.id,
          overrideAccess: false,
          user,
        }),
        { status: 403 },
      );
    }
    const origin = new URL(process.env.APP_URL!).origin;
    const response = await handleEndpoints({
      config,
      request: new Request(origin + "/api/subscription-campaign-grants"),
    });
    assert.equal(response.status, 501);
    assert.ok(!(await response.text()).includes(key));
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down(adapter as unknown as MigrateDownArgs),
        /Preserve campaign grants before rollback/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    assert.equal(
      (await payload.findByID({ collection: "subscription-campaign-grants", id: record.id })).id,
      record.id,
    );
    console.log("PASS 群发授权私有集合、默认关闭、唯一约束和迁移回退保护");
  } finally {
    if (people.length)
      await payload.delete({
        collection: "subscription-campaign-grants",
        where: { staff: { in: people } },
      });
    for (const id of people) await payload.delete({ collection: "staff", id });
    await db.end();
  }
}
