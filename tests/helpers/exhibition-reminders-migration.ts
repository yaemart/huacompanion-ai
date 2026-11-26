import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { handleEndpoints, type Payload } from "payload";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { databaseFingerprints } from "./database-fingerprints";

export async function testExhibitionReminderMigration(p: Payload) {
  assert.equal(process.env.APP_ENV, "local");
  const url = new URL(process.env.DATABASE_URL!);
  assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  const collection = p.config.collections.find((c) => c.slug === "exhibition-reminder-jobs");
  assert.ok(collection, "Private reminder collection is registered");
  assert.equal(collection.endpoints, false);
  assert.equal(collection.admin.hidden, true);
  const { up, down } = await import("../../src/migrations/20261126_130000_exhibition_reminders");
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const adapter = { db: { execute: (text: string) => db.query(text) } };
  const key = randomUUID().replaceAll("-", "").repeat(2);
  let subscription: number | undefined;
  let job: number | undefined;
  try {
    const before = await databaseFingerprints(db);
    await db.query("BEGIN");
    try {
      await down(adapter as unknown as MigrateDownArgs);
      assert.deepEqual(
        await databaseFingerprints(db),
        before.filter((row) => row.table !== "exhibition_reminder_jobs"),
      );
      await up(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    const s = await p.create({
      collection: "subscriptions",
      data: {
        email: `migration-${key.slice(0, 12)}@example.invalid`,
        topic: "exhibition:fixture-fair",
        locale: "zh",
        privacyVersion: "fictional-v1",
        sourcePath: "/zh",
        status: "pending",
        consentVersion: 1,
        consentedAt: new Date().toISOString(),
      },
    });
    subscription = s.id;
    const data = {
      key,
      scope: '["fixture-fair","zh"]',
      subscription,
      body: { status: "local-held" },
    };
    assert.equal(
      (await p.count({ collection: "exhibition-reminder-jobs", where: { key: { equals: key } } }))
        .totalDocs,
      0,
    );
    job = (await p.create({ collection: "exhibition-reminder-jobs", data })).id;
    assert.equal(
      (await p.count({ collection: "exhibition-reminder-jobs", where: { key: { equals: key } } }))
        .totalDocs,
      1,
    );
    await assert.rejects(p.create({ collection: "exhibition-reminder-jobs", data }));
    for (const suffix of ["", "/" + job]) {
      const response = await handleEndpoints({
        config: p.config,
        request: new Request(process.env.APP_URL + "/api/exhibition-reminder-jobs" + suffix),
      });
      assert.equal(response.status, 501);
      assert.doesNotMatch(await response.text(), new RegExp(key));
    }
    await assert.rejects(
      p.find({ collection: "exhibition-reminder-jobs", overrideAccess: false }),
      { status: 403 },
    );
    const frozen = await databaseFingerprints(db);
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve/);
    } finally {
      await db.query("ROLLBACK");
    }
    assert.deepEqual(await databaseFingerprints(db), frozen);
    await p.delete({ collection: "exhibition-reminder-jobs", id: job });
    job = undefined;
    assert.equal(
      (await p.count({ collection: "exhibition-reminder-jobs", where: { key: { equals: key } } }))
        .totalDocs,
      0,
    );
    console.log(
      "PASS exhibition reminder migration: additive private table, empty rollback, history guard, uniqueness, endpoint denial and real count probe",
    );
  } finally {
    if (job) await p.delete({ collection: "exhibition-reminder-jobs", id: job });
    if (subscription) await p.delete({ collection: "subscriptions", id: subscription });
    await db.end();
  }
}
