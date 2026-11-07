import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { configureTrial } from "../../src/server/trial-config";
import { featureNames } from "../../src/lib/support-features";
import { visitorAction } from "../../src/server/support/service";

if (process.env.APP_ENV !== "local") throw Error("Local fixture database required");
const p = await getPayload({ config });
const support = await p.findGlobal({ slug: "support-settings" });
const customer = await p.findGlobal({ slug: "customer-settings" });
const workflow = await p.findGlobal({ slug: "workflow-settings" });
const counts = async () =>
  Promise.all(
    (["inquiries", "providers", "staff", "content-drafts", "customer-accounts"] as const).map(
      async (collection) => (await p.count({ collection })).totalDocs,
    ),
  );
try {
  const before = await counts();
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  await assert.rejects(
    () => configureTrial(p, { APP_ENV: "trial", BUSINESS_AI_ENABLED: "true" }, true),
    /BUSINESS_AI_ENABLED=false/,
  );
  await p.updateGlobal({
    slug: "support-settings",
    data: Object.fromEntries(Object.keys(featureNames).map((key) => [key, true])),
  });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
  await assert.rejects(() => configureTrial(p, { APP_ENV: "production" }, true), /local.*trial/);
  const preview = await configureTrial(p, { APP_ENV: "trial" }, false);
  assert.equal(preview.applied, false);
  assert.equal((await p.findGlobal({ slug: "support-settings" })).textChat, true);
  const result = await configureTrial(p, { APP_ENV: "local" }, true);
  assert.equal(result.applied, true);
  const closed = await p.findGlobal({ slug: "support-settings" });
  for (const key of Object.keys(featureNames) as (keyof typeof featureNames)[])
    assert.equal(closed[key], false, key);
  assert.equal((await p.findGlobal({ slug: "customer-settings" })).enabled, false);
  assert.equal((await p.findGlobal({ slug: "workflow-settings" })).emailEnabled, false);
  assert.deepEqual(await counts(), before);
  const audit = await p.findByID({ collection: "audit-events", id: result.auditID! });
  assert.equal(audit.action, "configure-trial");
  assert.equal(audit.entity, "trial-settings");
  await assert.rejects(
    () => visitorAction(p, randomUUID(), { action: "start", key: randomUUID(), locale: "en" }),
    /尚未启用/,
  );
  for (const slug of ["support-settings", "customer-settings", "workflow-settings"] as const) {
    await assert.rejects(() => p.updateGlobal({ slug, overrideAccess: false, data: {} }));
    await assert.rejects(() => p.findGlobal({ slug, overrideAccess: false }));
    const editor = { ...admin, role: "editor" as const, additionalRoles: [] };
    await assert.rejects(() =>
      p.updateGlobal({ slug, overrideAccess: false, user: editor, data: {} }),
    );
    await assert.rejects(() => p.findGlobal({ slug, overrideAccess: false, user: editor }));
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    for (const setting of ["support", "customer", "workflow"] as const) {
      const transactionID = await p.db.beginTransaction();
      assert.ok(transactionID);
      let pending: ReturnType<typeof configureTrial> | undefined;
      let committed = false;
      try {
        const req = { transactionID };
        if (setting === "support")
          await p.updateGlobal({
            slug: "support-settings",
            user: admin,
            overrideAccess: false,
            data: { textChat: true },
            req,
          });
        else if (setting === "customer")
          await p.updateGlobal({
            slug: "customer-settings",
            user: admin,
            overrideAccess: false,
            data: { enabled: true },
            req,
          });
        else
          await p.updateGlobal({
            slug: "workflow-settings",
            user: admin,
            overrideAccess: false,
            data: { emailEnabled: true },
            req,
          });
        pending = configureTrial(p, { APP_ENV: "local" }, true);
        let blocked = false;
        const query =
          setting === "support"
            ? "%726280%"
            : setting === "customer"
              ? "%726281%"
              : "%workflow_settings%";
        for (let attempt = 0; attempt < 500; attempt++) {
          const waiting = await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() " +
              "AND wait_event_type = 'Lock' AND query LIKE $1",
            [query],
          );
          if (waiting.rowCount) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(blocked, `trial configuration waits for ${setting} administrator transaction`);
        await p.db.commitTransaction(transactionID);
        committed = true;
        const concurrent = await pending;
        const concurrentAudit = await p.findByID({
          collection: "audit-events",
          id: concurrent.auditID!,
        });
        const prior = concurrentAudit.before as Record<string, Record<string, boolean>>;
        const field =
          setting === "support" ? "textChat" : setting === "customer" ? "enabled" : "emailEnabled";
        assert.equal(
          prior[setting][field],
          true,
          `${setting} audit captures committed administrator value`,
        );
      } finally {
        if (!committed) await p.db.rollbackTransaction(transactionID);
        if (pending) await pending.catch(() => {});
      }
    }
  } finally {
    await pool.end();
  }
  console.log(
    "PASS trial dry-run, environment guard, persisted closure, audit, data preservation, closed API, settings permissions and concurrent audit snapshots",
  );
} finally {
  await p.updateGlobal({
    slug: "support-settings",
    data: Object.fromEntries(
      Object.keys(featureNames).map((key) => [
        key,
        support[key as keyof typeof featureNames] === true,
      ]),
    ),
  });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: customer.enabled === true } });
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { emailEnabled: workflow.emailEnabled === true },
  });
  await p.destroy();
}
process.exit(0);
