import {
  up as upCutover,
  down as downCutover,
} from "../../src/migrations/20261128_190000_crm_followup_cutover";
import {
  up as upFollowups,
  down as downFollowups,
} from "../../src/migrations/20261128_170000_crm_followups";
import {
  up as upLinks,
  down as downLinks,
} from "../../src/migrations/20261128_130000_crm_inquiry_links";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Staff } from "../../payload-types";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { up, down } from "../../src/migrations/20261128_090000_crm_core";
import { crmAction } from "../../src/server/crm/service";
import { crmRead } from "../../src/server/crm/read";
import { transactionSession } from "../../src/server/db-types";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const config = (await import("../../src/payload.config")).default;
const p = await getPayload({ config });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
const staffUser = (s: Staff) => ({ ...s, collection: "staff" as const });
let checks = 0;
const pass = (s: string) => console.log(`PASS CRM ${++checks}: ${s}`);
const fingerprints = () => databaseFingerprints(pool);
async function rejected(fn: () => Promise<unknown>, status: number) {
  const before = await fingerprints();
  await assert.rejects(fn, { status });
  assert.deepEqual(await fingerprints(), before, "rejected operation must not write any table");
}
async function migrate(fn: typeof up, rollback = false) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (fn === down)
      await downCutover({
        db: { execute: (sql: string) => db.query(sql) },
      } as unknown as Parameters<typeof downCutover>[0]);
    if (fn === down)
      await downFollowups({
        db: { execute: (sql: string) => db.query(sql) },
      } as unknown as Parameters<typeof downFollowups>[0]);
    if (fn === down)
      await downLinks({ db: { execute: (sql: string) => db.query(sql) } } as unknown as Parameters<
        typeof downLinks
      >[0]);
    await fn({ db: { execute: (sql: string) => db.query(sql) } } as unknown as Parameters<
      typeof up
    >[0]);
    if (fn === up)
      await upLinks({ db: { execute: (sql: string) => db.query(sql) } } as unknown as Parameters<
        typeof upLinks
      >[0]);
    if (fn === up)
      await upFollowups({
        db: { execute: (sql: string) => db.query(sql) },
      } as unknown as Parameters<typeof upFollowups>[0]);
    if (fn === up)
      await upCutover({ db: { execute: (sql: string) => db.query(sql) } } as unknown as Parameters<
        typeof upCutover
      >[0]);
    await db.query(rollback ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "CRM fixture admin",
      email: "admin@example.invalid",
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const adminReq = { user: staffUser(admin) };
  const team = await p.create({ collection: "teams", data: { name: "CRM team" } });
  const otherTeam = await p.create({ collection: "teams", data: { name: "Other CRM team" } });
  const makeStaff = (
    name: string,
    role: "operations" | "manager" | "editor" | "reviewer",
    t = team.id,
  ) =>
    p.create({
      collection: "staff",
      req: adminReq,
      data: {
        name,
        email: `${name}@example.invalid`,
        password: key(),
        role,
        team: t,
        active: true,
      },
    });
  const op = await makeStaff("operator", "operations");
  const other = await makeStaff("other", "operations");
  const foreign = await makeStaff("foreign", "operations", otherTeam.id);
  const manager = await makeStaff("manager", "manager");
  const editor = await makeStaff("editor", "editor");
  const reviewer = await makeStaff("reviewer", "reviewer");
  const dual = await p.update({
    collection: "staff",
    id: editor.id,
    data: { additionalRoles: ["operations"] },
    req: adminReq,
  });
  const user = staffUser(admin),
    operator = staffUser(op);
  const inquiry = await p.create({
    collection: "inquiries",
    data: {
      reference: "CRM-LEGACY",
      requestKey: key(),
      contentHash: key(),
      name: "Legacy customer",
      email: "legacy@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      team: team.id,
      owner: op.id,
    },
    req: adminReq,
  });
  const account = await p.create({
    collection: "customer-accounts",
    data: {
      email: "legacy@example.invalid",
      verifiedAt: new Date().toISOString(),
      active: true,
    },
  });
  await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: account.id,
      inquiry: inquiry.id,
      verifiedBy: admin.id,
      verificationReason: "Existing independent fixture evidence",
      verifiedAt: new Date().toISOString(),
      active: true,
      dedupe: `${account.id}:${inquiry.id}`,
    },
  });
  const old = (await fingerprints()).filter((t) => !t.table.startsWith("crm_"));
  await migrate(down);
  assert.deepEqual(await databaseFingerprints(pool, old), old);
  await migrate(up);
  assert.deepEqual(await databaseFingerprints(pool, old), old);
  pass(
    "empty down/up preserves populated legacy staff, inquiry, independent authorization and all old tables",
  );
  const create = {
    action: "createClient",
    operationKey: key(),
    kind: "company",
    displayName: "CRM Example",
    language: "en",
  };
  const a = await crmAction(p, operator, create);
  assert.deepEqual(await crmAction(p, operator, create), a);
  await rejected(() => crmAction(p, operator, { ...create, displayName: "Changed" }), 409);
  await rejected(() => crmAction(p, { ...operator, collection: "customer-accounts" }, create), 403);
  const b = await crmAction(p, operator, { ...create, kind: "individual", operationKey: key() });
  const f = await crmAction(p, staffUser(foreign), { ...create, operationKey: key() });
  await crmAction(p, staffUser(dual), { ...create, operationKey: key() });
  pass("personal/company, fixed roles, additionalRoles, idempotency and identity boundary");
  await rejected(
    () => crmAction(p, operator, { ...create, operationKey: key(), ownerID: other.id }),
    400,
  );
  await rejected(
    () =>
      crmAction(p, user, { ...create, operationKey: key(), teamID: team.id, ownerID: manager.id }),
    400,
  );
  await rejected(() => crmAction(p, staffUser(reviewer), create), 403);
  const get = async (id: number, actor = operator) => {
    const r = await crmRead(p, actor, { action: "get", clientID: id });
    assert.ok("revision" in r);
    return r;
  };
  await rejected(() => get(a.clientID, staffUser(other)), 404);
  await rejected(() => get(f.clientID, staffUser(manager)), 404);
  await rejected(() => get(999999), 404);
  await rejected(() => crmRead(p, operator, { action: "list", where: {} }), 400);
  const beforeRead = await fingerprints();
  const list = await crmRead(p, operator, { action: "list" });
  assert.ok("total" in list && list.total === 2);
  const teamList = await crmRead(p, staffUser(manager), { action: "list" });
  assert.ok("total" in teamList && teamList.total === 3);
  assert.deepEqual(
    Object.keys(await get(a.clientID)).sort(),
    [
      "id",
      "reference",
      "kind",
      "displayName",
      "language",
      "countryCode",
      "teamID",
      "ownerID",
      "status",
      "revision",
      "createdAt",
    ].sort(),
  );
  assert.deepEqual(await fingerprints(), beforeRead);
  pass("scope-filtered pagination/counts, exact DTO, READ ONLY and hidden/not-found equivalence");
  const contact = await crmAction(p, operator, {
    action: "saveContact",
    operationKey: key(),
    clientID: a.clientID,
    expectedClientRevision: 1,
    name: "Shared name",
    email: " SAME@EXAMPLE.INVALID ",
  });
  const same = await crmAction(p, operator, {
    action: "saveContact",
    operationKey: key(),
    clientID: b.clientID,
    expectedClientRevision: 1,
    name: "Shared name",
    email: "same@example.invalid",
  });
  assert.notEqual(contact.contactID, same.contactID);
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "saveContact",
        operationKey: key(),
        clientID: b.clientID,
        contactID: contact.contactID,
        expectedClientRevision: 2,
        expectedRevision: 1,
        name: "Hijack",
      }),
    404,
  );
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "saveContact",
        operationKey: key(),
        clientID: a.clientID,
        contactID: contact.contactID,
        expectedClientRevision: 2,
        expectedRevision: 1,
        email: null,
      }),
    400,
  );
  const update = {
    action: "updateClient",
    operationKey: key(),
    clientID: a.clientID,
    expectedRevision: 2,
    displayName: "Updated",
  };
  const updated = await crmAction(p, operator, update);
  assert.deepEqual(
    await crmAction(p, operator, update),
    updated,
    "replay precedes stale version check",
  );
  await rejected(() => crmAction(p, operator, { ...update, operationKey: key() }), 409);
  const primary = await crmAction(p, operator, {
    action: "setPrimaryContact",
    operationKey: key(),
    clientID: a.clientID,
    contactID: contact.contactID,
    expectedClientRevision: 3,
  });
  const second = await crmAction(p, operator, {
    action: "saveContact",
    operationKey: key(),
    clientID: a.clientID,
    expectedClientRevision: primary.clientRevision,
    name: "Second",
    phone: "+00-fictional",
  });
  await crmAction(p, operator, {
    action: "setPrimaryContact",
    operationKey: key(),
    clientID: a.clientID,
    contactID: second.contactID,
    expectedClientRevision: second.clientRevision,
  });
  const rows = await pool.query(
    "SELECT id,is_primary,revision FROM crm_contacts WHERE client_id=$1 ORDER BY id",
    [a.clientID],
  );
  assert.equal(rows.rows.filter((r) => r.is_primary).length, 1);
  assert.equal(rows.rows[0].is_primary, false);
  await assert.rejects(() =>
    pool.query("UPDATE crm_contacts SET is_primary=true WHERE id=$1", [contact.contactID]),
  );
  pass("relationship-local contacts, parent-ID guard, version checks and DB unique primary");
  const save = p.create.bind(p);
  p.create = (async (args: Parameters<typeof p.create>[0]) => {
    if (args.collection === "audit-events") throw new Error("Injected audit failure");
    return save(args);
  }) as typeof p.create;
  const beforeFailure = await fingerprints();
  await assert.rejects(
    () => crmAction(p, operator, { ...create, operationKey: key() }),
    /Injected audit failure/,
  );
  p.create = save;
  assert.deepEqual(await fingerprints(), beforeFailure);
  const concurrent = { ...create, operationKey: key() };
  const both = await Promise.all([
    crmAction(p, operator, concurrent),
    crmAction(p, operator, concurrent),
  ]);
  assert.deepEqual(both[0], both[1]);
  assert.equal(
    (
      await pool.query("SELECT count(*) FROM crm_operations WHERE operation_key=$1", [
        concurrent.operationKey,
      ])
    ).rows[0].count,
    "1",
  );
  pass("audit failure rolls back every table and concurrent replay commits exactly once");
  for (const collection of ["crm-clients", "crm-contacts", "crm-operations"] as const) {
    await assert.rejects(() => p.find({ collection, overrideAccess: false, user, depth: 0 }), {
      status: 403,
    });
    await assert.rejects(() => p.delete({ collection, id: 1, overrideAccess: false, user }));
  }
  pass("generic Local API reads/deletes denied even for admin");
  const block = await p.db.beginTransaction();
  assert.ok(block);
  const db = transactionSession(p, block).db;
  await db.execute("SELECT pg_advisory_xact_lock(726281)");
  const wait = crmAction(p, operator, { ...create, operationKey: key() });
  const failure = assert.rejects(wait, { status: 403 });
  const deadline = Date.now() + 10000;
  while (
    !(
      await pool.query(
        "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
      )
    ).rowCount
  ) {
    assert.ok(Date.now() < deadline, "CRM write waits on actual business lock");
    await new Promise((r) => setTimeout(r, 10));
  }
  await p.update({
    collection: "staff",
    id: op.id,
    data: { active: false },
    req: { ...adminReq, transactionID: block },
  });
  await p.db.commitTransaction(block);
  await failure;
  await rejected(() => crmAction(p, operator, create), 403);
  await p.update({ collection: "staff", id: op.id, data: { active: true }, req: adminReq });
  pass("real PG lock barrier: stopped employee rejected after waiting; stale replay cannot bypass");
  const parent = await get(a.clientID);
  const latest = (
    await pool.query("SELECT revision FROM crm_contacts WHERE id=$1", [second.contactID])
  ).rows[0];
  const archived = await crmAction(p, operator, {
    action: "archiveContact",
    operationKey: key(),
    clientID: a.clientID,
    contactID: second.contactID,
    expectedRevision: Number(latest.revision),
    expectedClientRevision: parent.revision,
    reason: "Archive contact fixture",
  });
  const archivedRow = (
    await pool.query("SELECT status,is_primary FROM crm_contacts WHERE id=$1", [second.contactID])
  ).rows[0];
  assert.deepEqual(archivedRow, { status: "archived", is_primary: false });
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "setPrimaryContact",
        operationKey: key(),
        clientID: a.clientID,
        contactID: second.contactID,
        expectedClientRevision: archived.clientRevision,
      }),
    409,
  );
  const contacts = await crmRead(p, operator, {
    action: "contacts",
    clientID: a.clientID,
    status: "archived",
  });
  assert.ok(
    "items" in contacts && contacts.items?.some((c) => "id" in c && c.id === second.contactID),
  );
  pass("contact archive clears primary flag, remains readable and cannot be reactivated");
  const commit = p.db.commitTransaction;
  let lost = false;
  p.db.commitTransaction = async (id) => {
    await commit.call(p.db, id);
    if (!lost) {
      lost = true;
      throw Error("Committed response lost");
    }
  };
  const unknown = { ...create, operationKey: key() };
  await assert.rejects(() => crmAction(p, operator, unknown), /Committed response lost/);
  p.db.commitTransaction = commit;
  const recovered = await crmAction(p, operator, unknown);
  assert.equal(
    (
      await pool.query("SELECT count(*) FROM crm_operations WHERE operation_key=$1", [
        unknown.operationKey,
      ])
    ).rows[0].count,
    "1",
  );
  assert.ok(recovered.clientID > 0);
  pass("real COMMIT response loss recovered by original operation key without duplicate creation");
  const beforeArchive = await get(b.clientID);
  await crmAction(p, operator, {
    action: "archiveClient",
    operationKey: key(),
    clientID: b.clientID,
    expectedRevision: beforeArchive.revision,
    reason: "Fixture archive requested",
  });
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "saveContact",
        operationKey: key(),
        clientID: b.clientID,
        expectedClientRevision: beforeArchive.revision + 1,
        name: "Late",
        phone: "invalid",
      }),
    409,
  );
  const beforeDown = await fingerprints();
  await assert.rejects(() => migrate(down), /Preserve CRM data/);
  assert.deepEqual(await fingerprints(), beforeDown);
  pass("archived clients read-only and nonempty migration rollback refused without side effects");
  const secret = p.secret;
  p.secret = "rotation-test-secret-".repeat(3);
  await rejected(() => crmAction(p, operator, create), 409);
  p.secret = secret;
  const legacy = old.filter((t) =>
    [
      "customer_inquiry_links",
      "customer_accounts",
      "inquiries",
      "service_cases",
      "service_quotes",
    ].includes(t.table),
  );
  assert.deepEqual(await databaseFingerprints(pool, legacy), legacy);
  const audit = await pool.query("SELECT before,after FROM audit_events WHERE entity='crm'");
  assert.ok(!JSON.stringify(audit.rows).includes("same@example.invalid"));
  assert.equal(
    (await pool.query("SELECT count(*) FROM customer_inquiry_links")).rows[0].count,
    "1",
  );
  assert.equal((await pool.query("SELECT count(*) FROM workflow_mail_jobs")).rows[0].count, "0");
  pass(
    "secret rotation rejects old keys, audit omits contact values, old authorization/mail untouched",
  );
  const rollbackDb = await pool.connect();
  const unchanged = await fingerprints();
  try {
    await rollbackDb.query("BEGIN");
    await rollbackDb.query(
      "DELETE FROM crm_operations; DELETE FROM crm_contacts; DELETE FROM crm_clients",
    );
    await rollbackDb.query(
      "INSERT INTO crm_operations(actor_id,key,operation_key,action,input_digest,epoch,result) VALUES($1,$2,$3,'fixture','hash','epoch','{}')",
      [admin.id, key(), key()],
    );
    await assert.rejects(
      () =>
        down({ db: { execute: (sql: string) => rollbackDb.query(sql) } } as unknown as Parameters<
          typeof down
        >[0]),
      /Preserve CRM data/,
    );
  } finally {
    await rollbackDb.query("ROLLBACK");
    rollbackDb.release();
  }
  assert.deepEqual(await fingerprints(), unchanged);
  pass("operation-history-only rollback protection preserves every table");
  for (const slug of ["crm-clients", "crm-contacts", "crm-operations"]) {
    const c = p.config.collections.find((c) => c.slug === slug);
    assert.equal(c?.graphQL, false);
    assert.equal(c?.endpoints, false);
  }
  pass("generic REST endpoints and GraphQL explicitly disabled in actual sanitized Payload config");
  console.log(`CRM integration: ${checks} groups passed`);
} finally {
  await p.destroy();
}
process.exit(0);
