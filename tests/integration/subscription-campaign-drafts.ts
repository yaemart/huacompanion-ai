import {
  up as upFeedback,
  down as downFeedback,
} from "../../src/migrations/20261125_120000_subscription_campaign_feedback";
import {
  up as upContinuation,
  down as downContinuation,
} from "../../src/migrations/20261124_090000_subscription_campaign_continuation";
import {
  up as upAttempts,
  down as downAttempts,
} from "../../src/migrations/20261121_213000_subscription_campaign_mock_attempts";
import {
  up as upLeases,
  down as downLeases,
} from "../../src/migrations/20261121_130000_subscription_campaign_mock_leases";
import {
  up as upQuota,
  down as downQuota,
} from "../../src/migrations/20261121_090000_subscription_campaign_mock_quota";
import {
  up as upRecheck,
  down as downRecheck,
} from "../../src/migrations/20261120_170000_subscription_campaign_recheck";
import {
  up as upFreeze,
  down as downFreeze,
} from "../../src/migrations/20261120_150000_subscription_campaign_freeze";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { handleEndpoints, type Payload } from "payload";
import pg from "pg";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261120_110000_subscription_campaign_drafts";
import {
  up as upChecks,
  down as downChecks,
} from "../../src/migrations/20261120_130000_subscription_campaign_checks";
import { databaseFingerprints } from "../helpers/database-fingerprints";

export async function testCampaignDraftSchema(payload: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const people: number[] = [];
  const key = randomUUID();
  const adapter = { db: { execute: (statement: string) => db.query(statement) } };
  try {
    assert.equal(
      (await payload.count({ collection: "subscription-campaign-drafts" })).totalDocs,
      0,
    );
    await db.query("BEGIN");
    try {
      const before = await databaseFingerprints(db);
      await downContinuation(adapter as unknown as MigrateDownArgs);
      await downFeedback(adapter as unknown as MigrateDownArgs);
      await downAttempts(adapter as unknown as MigrateDownArgs);
      await downLeases(adapter as unknown as MigrateDownArgs);
      await downQuota(adapter as unknown as MigrateDownArgs);
      await downRecheck(adapter as unknown as MigrateDownArgs);
      await downFreeze(adapter as unknown as MigrateDownArgs);
      await downChecks(adapter as unknown as MigrateDownArgs);
      await down(adapter as unknown as MigrateDownArgs);
      assert.deepEqual(
        await databaseFingerprints(db),
        before.filter(
          (r) =>
            ![
              "subscription_campaign_feedback",
              "subscription_marketing_suppressions",
              "subscription_campaign_drafts",
              "subscription_campaign_checks",
              "subscription_campaign_batches",
              "subscription_campaign_jobs",
              "subscription_campaign_mock_budgets",
              "subscription_campaign_mock_slots",
              "subscription_campaign_mock_attempts",
              "subscription_campaign_mock_leases",
            ].includes(r.table),
        ),
      );
      await up(adapter as unknown as MigrateUpArgs);
      await upChecks(adapter as unknown as MigrateUpArgs);
      await upFreeze(adapter as unknown as MigrateUpArgs);
      await upRecheck(adapter as unknown as MigrateUpArgs);
      await upQuota(adapter as unknown as MigrateUpArgs);
      await upLeases(adapter as unknown as MigrateUpArgs);
      await upAttempts(adapter as unknown as MigrateUpArgs);
      await upFeedback(adapter as unknown as MigrateUpArgs);
      await upContinuation(adapter as unknown as MigrateUpArgs);
      assert.deepEqual(await databaseFingerprints(db), before);
    } finally {
      await db.query("ROLLBACK");
    }
    for (const role of ["admin", "manager", "operations", "editor", "reviewer"] as const) {
      const person = await payload.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: { name: role, email: `${role}-${key}@example.invalid`, password: key, role },
      });
      people.push(person.id);
    }
    const data = {
      campaignKey: key,
      owner: people[1],
      topic: "policy-updates" as const,
      revision: 1,
      selections: [],
      preview: {},
    };
    const draft = await payload.create({ collection: "subscription-campaign-drafts", data });
    for (const user of [
      undefined,
      ...(await Promise.all(people.map((id) => payload.findByID({ collection: "staff", id })))),
    ]) {
      const scope = {
        collection: "subscription-campaign-drafts" as const,
        overrideAccess: false,
        user,
      };
      await assert.rejects(payload.find(scope), { status: 403 });
      await assert.rejects(payload.create({ ...scope, data }), { status: 403 });
      await assert.rejects(payload.update({ ...scope, id: draft.id, data: { revision: 2 } }), {
        status: 403,
      });
      await assert.rejects(payload.delete({ ...scope, id: draft.id }), { status: 403 });
    }
    await assert.rejects(payload.create({ collection: "subscription-campaign-drafts", data }));
    const response = await handleEndpoints({
      config,
      request: new Request(
        new URL(process.env.APP_URL!).origin + "/api/subscription-campaign-drafts",
      ),
    });
    assert.equal(response.status, 501);
    await db.query("BEGIN");
    try {
      await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve campaign drafts/);
    } finally {
      await db.query("ROLLBACK");
    }
    console.log("PASS 群发草稿私有存储、版本唯一和无损迁移");
  } finally {
    await db.query("DELETE FROM subscription_campaign_drafts WHERE campaign_key=$1", [key]);
    await db.query("DELETE FROM staff WHERE id=ANY($1::int[])", [people]);
    await db.end();
  }
}
