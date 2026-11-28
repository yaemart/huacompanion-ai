import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import {
  preflightFollowupImport,
  importLegacyFollowups,
  undoLegacyFollowupImport,
} from "../../src/server/crm/followup-import";
import { down, up } from "../../src/migrations/20261128_190000_crm_followup_cutover";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const p = await getPayload({ config: (await import("../../src/payload.config")).default });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
let checks = 0;
const pass = (s: string) => console.log(`PASS C2 migration ${++checks}: ${s}`);
try {
  const emptyDb = await pool.connect();
  try {
    await emptyDb.query("BEGIN");
    await down({ db: { execute: (s: string) => emptyDb.query(s) } } as unknown as Parameters<
      typeof down
    >[0]);
    await up({ db: { execute: (s: string) => emptyDb.query(s) } } as unknown as Parameters<
      typeof up
    >[0]);
    await emptyDb.query("COMMIT");
  } catch (e) {
    await emptyDb.query("ROLLBACK");
    throw e;
  } finally {
    emptyDb.release();
  }
  pass("empty cutover migration down/up");
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "C2 admin",
      email: `${key()}@example.invalid`,
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const user = { ...admin, collection: "staff" as const },
    req = { user };
  const team = await p.create({ collection: "teams", data: { name: "C2 virtual team" } });
  const operator = await p.create({
    collection: "staff",
    req,
    data: {
      name: "C2 operator",
      email: `${key()}@example.invalid`,
      password: key(),
      role: "operations",
      active: true,
      team: team.id,
    },
  });
  const makeInquiry = async (due?: string) =>
    p.create({
      collection: "inquiries",
      req,
      data: {
        reference: `C2-${key()}`,
        requestKey: key(),
        contentHash: key(),
        name: "C2 fictional",
        email: "c2@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        status: "new",
        owner: operator.id,
        team: team.id,
        nextFollowUp: due,
      },
    });
  const q = await makeInquiry("2026-11-20T01:00:00.000Z"),
    empty = await makeInquiry(),
    closed = await makeInquiry("2026-11-19T01:00:00Z"),
    invalid = await makeInquiry();
  await pool.query("UPDATE inquiries SET status='closed',coordination_stage='closed' WHERE id=$1", [
    closed.id,
  ]);
  await pool.query("UPDATE inquiries SET next_follow_up='infinity' WHERE id=$1", [invalid.id]);
  const before = (await databaseFingerprints(pool)).filter(
    (t) =>
      !t.table.startsWith("crm_followup") &&
      t.table !== "crm_operations" &&
      t.table !== "audit_events",
  );
  const preview = await preflightFollowupImport(p, user, { page: 1, limit: 20 });
  const selected = preview.items.filter((x) =>
    [q.id, empty.id, closed.id, invalid.id].includes(x.inquiryID),
  );
  assert.equal(selected.length, 4);
  assert.equal(selected.find((x) => x.inquiryID === q.id)!.state, "eligible");
  assert.equal(selected.find((x) => x.inquiryID === invalid.id)!.state, "blocked");
  pass("preflight reports invalid date without serializing the corrupt inquiry");
  const input = {
    action: "importLegacyFollowups",
    operationKey: key(),
    items: selected.map((x) => ({
      inquiryID: x.inquiryID,
      expectedUpdatedAt: x.updatedAt,
      expectedSlotRevision: x.slotRevision,
    })),
  };
  const receipt = await importLegacyFollowups(p, user, input);
  assert.equal(receipt.imported, 1);
  assert.equal(receipt.issues.length, 1);
  const slot = (
    await p.find({
      collection: "crm-followup-slots",
      where: { inquiry: { equals: q.id } },
      depth: 0,
    })
  ).docs[0];
  assert.equal(slot.cutoverState, "managed");
  assert.ok(slot.currentTask);
  const task = await p.findByID({
    collection: "crm-followups",
    id: Number(slot.currentTask),
    depth: 0,
  });
  assert.equal(task.needsReview, true);
  assert.equal(task.type, "primary");
  assert.equal(task.assignee, operator.id);
  assert.equal(task.dueAt, "2026-11-20T01:00:00.000Z");
  const after = await databaseFingerprints(pool);
  assert.deepEqual(
    await importLegacyFollowups(p, user, {
      ...input,
      operationKey: input.operationKey.toUpperCase(),
    }),
    receipt,
  );
  assert.deepEqual(await databaseFingerprints(pool), after);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  pass(
    "explicit import creates review-needed primary, preserves legacy data and is case-idempotent",
  );
  await assert.rejects(
    () => preflightFollowupImport(p, { ...operator, collection: "staff" }, { page: 1, limit: 20 }),
    { status: 403 },
  );
  await assert.rejects(
    () =>
      importLegacyFollowups(p, user, {
        ...input,
        operationKey: key(),
        items: [{ ...input.items[0], expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }],
      }),
    { status: 409 },
  );
  pass("admin-only import and stale preview rejection");
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await assert.rejects(() =>
      down({ db: { execute: (s: string) => tx.query(s) } } as unknown as Parameters<
        typeof down
      >[0]),
    );
    await tx.query("ROLLBACK");
  } finally {
    tx.release();
  }
  await undoLegacyFollowupImport(p, user, {
    action: "undoLegacyFollowupImport",
    operationKey: key(),
    items: [
      { inquiryID: q.id, expectedUpdatedAt: q.updatedAt, expectedSlotRevision: slot.revision },
    ],
  });
  assert.equal(
    (await p.count({ collection: "crm-followups", where: { inquiry: { equals: q.id } } }))
      .totalDocs,
    0,
  );
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  pass("pure import may be explicitly undone; live mapping prevents destructive down");

  const gated = await makeInquiry("2026-11-22T01:00:00Z");
  const notice = (
    await p.find({
      collection: "workflow-notifications",
      where: {
        and: [
          { inquiry: { equals: gated.id } },
          { key: { like: `inquiry:${gated.id}:followup:%` } },
        ],
      },
      depth: 0,
    })
  ).docs[0];
  assert.ok(notice);
  const job = await p.create({
    collection: "workflow-mail-jobs",
    data: {
      key: `notification:${notice.id}`,
      notification: notice.id,
      status: "uncertain",
      attempts: 1,
      nextAt: new Date().toISOString(),
    },
  });
  const gatePreview = await preflightFollowupImport(p, user, { page: 1, limit: 20 });
  const gateItem = gatePreview.items.find((x) => x.inquiryID === gated.id)!;
  assert.equal(gateItem.state, "blocked");
  assert.equal(gateItem.reason, "delivery-recovery-required");
  const gateResult = await importLegacyFollowups(p, user, {
    action: "importLegacyFollowups",
    operationKey: key(),
    items: [{ inquiryID: gated.id, expectedUpdatedAt: gated.updatedAt, expectedSlotRevision: 0 }],
  });
  assert.equal(gateResult.imported, 0);
  assert.equal(gateResult.issues[0].code, "delivery-recovery-required");
  assert.equal(
    (await p.findByID({ collection: "workflow-mail-jobs", id: job.id, depth: 0 })).status,
    "uncertain",
  );
  assert.equal(
    (await p.count({ collection: "crm-followup-slots", where: { inquiry: { equals: gated.id } } }))
      .totalDocs,
    0,
  );
  pass("uncertain delivery blocks preflight and cutover without canceling history");
  const fault = await makeInquiry("2026-11-23T01:00:00Z");
  await pool.query(
    "CREATE FUNCTION c2_fail_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='importLegacyFollowups' THEN RAISE EXCEPTION 'C2 receipt fault'; END IF; RETURN NEW; END $$",
  );
  await pool.query(
    "CREATE TRIGGER c2_fail_import BEFORE INSERT ON crm_operations FOR EACH ROW EXECUTE FUNCTION c2_fail_import()",
  );
  const beforeFault = await databaseFingerprints(pool);
  await assert.rejects(() =>
    importLegacyFollowups(p, user, {
      action: "importLegacyFollowups",
      operationKey: key(),
      items: [{ inquiryID: fault.id, expectedUpdatedAt: fault.updatedAt, expectedSlotRevision: 0 }],
    }),
  );
  assert.deepEqual(await databaseFingerprints(pool), beforeFault);
  await pool.query("DROP TRIGGER c2_fail_import ON crm_operations; DROP FUNCTION c2_fail_import()");
  pass("last import receipt failure rolls back task, slot, event and audit");
} finally {
  await p.destroy();
}
process.exit(0);
