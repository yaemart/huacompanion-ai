import { linkCustomerInquiry } from "../../src/server/customer/service";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Staff } from "../../payload-types";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { crmAction } from "../../src/server/crm/service";
import { crmRead } from "../../src/server/crm/read";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { transactionSession } from "../../src/server/db-types";
import { up, down } from "../../src/migrations/20261128_130000_crm_inquiry_links";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const config = (await import("../../src/payload.config")).default;
const p = await getPayload({ config });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
const actor = (s: Staff) => ({ ...s, collection: "staff" as const });
let checks = 0;
const pass = (name: string) => console.log(`PASS CRM links ${++checks}: ${name}`);
const fingerprints = () => databaseFingerprints(pool);
async function rejected(fn: () => Promise<unknown>, status: number) {
  const before = await fingerprints();
  await assert.rejects(fn, { status });
  assert.deepEqual(await fingerprints(), before);
}
async function migrate(fn: typeof up) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await fn({ db: { execute: (q: string) => c.query(q) } } as unknown as Parameters<typeof up>[0]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Links admin",
      email: `${key()}@example.invalid`,
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const user = actor(admin);
  const team = await p.create({ collection: "teams", data: { name: "Link team" } });
  const foreignTeam = await p.create({ collection: "teams", data: { name: "Foreign link team" } });
  const makeStaff = (role: "operations" | "manager" | "reviewer", t = team.id) =>
    p.create({
      collection: "staff",
      req: { user },
      data: {
        name: `Link ${role}`,
        email: `${key()}@example.invalid`,
        password: key(),
        role,
        team: t,
        active: true,
      },
    });
  const op = await makeStaff("operations"),
    other = await makeStaff("operations"),
    manager = await makeStaff("manager"),
    foreign = await makeStaff("operations", foreignTeam.id),
    reviewer = await makeStaff("reviewer");
  const operator = actor(op);
  const selfCreate = {
    action: "createClient",
    operationKey: key(),
    kind: "individual",
    displayName: "Original operator client",
    language: "en",
  };
  const selfCreated = await crmAction(p, operator, selfCreate);
  assert.ok(selfCreated.clientID);
  const makeClient = (name: string, ownerID: number | null = op.id, teamID = team.id) =>
    crmAction(p, user, {
      action: "createClient",
      operationKey: key(),
      kind: "company",
      displayName: name,
      language: "en",
      ownerID,
      teamID,
    });
  const a = await makeClient("First hidden history"),
    b = await makeClient("Second customer");
  const rootRevision = async (id: number) =>
    Number(
      (await pool.query("SELECT revision FROM crm_clients WHERE id=$1", [id])).rows[0].revision,
    );
  const makeInquiry = (owner = op.id, t = team.id, name = "Link visitor") =>
    p.create({
      collection: "inquiries",
      req: { user },
      data: {
        reference: `LINK-${key()}`,
        requestKey: key(),
        contentHash: key(),
        name,
        email: "links@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        status: "new",
        owner,
        team: t,
      },
    });
  const q = await makeInquiry(),
    hidden = await makeInquiry(other.id),
    foreignQ = await makeInquiry(foreign.id, foreignTeam.id);
  const service = await p.create({
    collection: "service-cases",
    data: {
      inquiry: q.id,
      title: "Derived service",
      stage: "received",
      revision: 1,
      internalArrangement: "PRIVATE ARRANGEMENT",
    },
  });
  const old = (await fingerprints()).filter((t) => t.table !== "crm_inquiry_links");
  await migrate(down);
  await migrate(up);
  assert.deepEqual(await databaseFingerprints(pool, old), old);
  pass("additive migration empty roundtrip preserves populated old tables");
  const unowned = await makeClient("Unowned", null);
  const managerCreated = await crmAction(p, actor(manager), {
    action: "createClient",
    operationKey: key(),
    kind: "individual",
    displayName: "Manager choice",
    language: "zh",
    ownerID: op.id,
  });
  assert.ok(managerCreated.clientID);
  await crmRead(p, actor(manager), { action: "get", clientID: unowned.clientID });
  await rejected(() => crmRead(p, operator, { action: "get", clientID: unowned.clientID }), 404);
  await rejected(
    () =>
      crmAction(p, actor(manager), {
        action: "createClient",
        operationKey: key(),
        kind: "company",
        displayName: "No owner",
        language: "en",
      }),
    400,
  );
  await rejected(
    () =>
      crmAction(p, actor(other), {
        action: "updateClient",
        operationKey: key(),
        clientID: a.clientID,
        expectedRevision: 1,
        displayName: "Hijack",
      }),
    404,
  );
  pass("A1a follow-up: manager/unowned creation matrix and cross-scope writes");
  const linkInput = {
    action: "linkInquiry",
    operationKey: key(),
    clientID: a.clientID,
    inquiryID: q.id,
    expectedClientRevision: 1,
    expectedLinkRevision: 0,
    reason: "Verified business association",
  };
  const businessBefore = (await fingerprints()).filter((t) =>
    [
      "inquiries",
      "service_cases",
      "service_quotes",
      "customer_inquiry_links",
      "workflow_mail_jobs",
      "workflow_tasks",
    ].includes(t.table),
  );
  const linked = await crmAction(p, operator, linkInput);
  assert.equal(linked.revision, 1);
  assert.equal(linked.clientRevision, 2);
  const beforeReplay = await fingerprints();
  assert.deepEqual(await crmAction(p, operator, linkInput), linked);
  assert.deepEqual(await fingerprints(), beforeReplay);
  assert.deepEqual(await databaseFingerprints(pool, businessBefore), businessBefore);
  await rejected(
    () => crmAction(p, operator, { ...linkInput, operationKey: key(), expectedClientRevision: 2 }),
    409,
  );
  await rejected(
    () => crmAction(p, operator, { ...linkInput, reason: "Changed evidence for same operation" }),
    409,
  );
  await rejected(
    () =>
      crmAction(p, operator, {
        ...linkInput,
        operationKey: key(),
        inquiryID: hidden.id,
        expectedClientRevision: 2,
      }),
    404,
  );
  await rejected(
    () =>
      crmAction(p, user, {
        ...linkInput,
        operationKey: key(),
        inquiryID: foreignQ.id,
        expectedClientRevision: 2,
      }),
    409,
  );
  await rejected(() => crmAction(p, actor(reviewer), linkInput), 403);
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "archiveClient",
        operationKey: key(),
        clientID: a.clientID,
        expectedRevision: 2,
        reason: "Archive linked customer",
      }),
    409,
  );
  pass(
    "unique link, double scope, same-team check, current replay, archive block and old business unchanged",
  );
  const readBefore = await fingerprints();
  const listed = await crmRead(p, operator, { action: "linkedInquiries", clientID: a.clientID });
  assert.ok("items" in listed && listed.total === 1);
  const item = listed.items[0];
  assert.deepEqual(
    Object.keys(item).sort(),
    [
      "linkID",
      "linkRevision",
      "clientRevision",
      "inquiryID",
      "reference",
      "name",
      "status",
      "serviceCase",
    ].sort(),
  );
  assert.ok("serviceCase" in item);
  assert.deepEqual(item.serviceCase, {
    id: service.id,
    title: service.title,
    stage: service.stage,
  });
  assert.ok(!JSON.stringify(listed).includes("PRIVATE ARRANGEMENT"));
  const candidates = await crmRead(p, operator, {
    action: "inquiryCandidates",
    clientID: b.clientID,
  });
  assert.ok("items" in candidates && candidates.total === 0);
  assert.deepEqual(await fingerprints(), readBefore);
  pass("READ ONLY exact link/derived-service DTO and candidates scoped before counts");
  const revocation = {
    action: "revokeInquiryLink",
    operationKey: key(),
    clientID: a.clientID,
    linkID: linked.linkID,
    expectedClientRevision: 2,
    expectedRevision: 1,
    reason: "Correct mistaken association",
  };
  const revoked = await crmAction(p, operator, revocation);
  assert.equal(revoked.revision, 2);
  assert.equal(revoked.clientRevision, 3);
  assert.deepEqual(await crmAction(p, operator, revocation), revoked);
  const previous = await crmRead(p, operator, {
    action: "inquiryCandidates",
    clientID: b.clientID,
  });
  assert.ok("items" in previous && previous.total === 1);
  assert.ok(
    "expectedLinkRevision" in previous.items[0] && previous.items[0].expectedLinkRevision === 2,
  );
  assert.ok(!JSON.stringify(previous).includes("First hidden history"));
  const rebound = await crmAction(p, operator, {
    ...linkInput,
    operationKey: key(),
    clientID: b.clientID,
    expectedClientRevision: 1,
    expectedLinkRevision: 2,
  });
  assert.equal(rebound.linkID, linked.linkID);
  assert.equal(rebound.revision, 3);
  assert.equal(await rootRevision(a.clientID), 3);
  await rejected(() => crmAction(p, operator, revocation), 404);
  await rejected(() => crmAction(p, operator, linkInput), 404);
  await assert.rejects(() =>
    pool.query(
      "INSERT INTO crm_inquiry_links(client_id,inquiry_id,active,revision,linked_by_id,linked_at,reason) VALUES($1,$2,true,1,$3,now(),'duplicate fixture')",
      [a.clientID, q.id, admin.id],
    ),
  );
  pass("revoke/rebind retains one row and history without disclosing previous client");
  const legacyClient = await makeClient("Legacy authorization client"),
    legacyQ = await makeInquiry();
  const legacyLinked = await crmAction(p, operator, {
    ...linkInput,
    operationKey: key(),
    clientID: legacyClient.clientID,
    inquiryID: legacyQ.id,
    expectedClientRevision: 1,
  });
  const account = await p.create({
    collection: "customer-accounts",
    data: { email: `${key()}@example.invalid`, active: true, verifiedAt: new Date().toISOString() },
  });
  const legacy = await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: account.id,
      inquiry: legacyQ.id,
      active: true,
      dedupe: `${account.id}:${legacyQ.id}`,
      verifiedBy: admin.id,
      verifiedAt: new Date().toISOString(),
      verificationReason: "Independent authorization evidence",
    },
  });
  const externalBefore = (await fingerprints()).filter(
    (t) => t.table.startsWith("customer_") || t.table.startsWith("workflow_"),
  );
  const legacyRevoke = {
    ...revocation,
    operationKey: key(),
    clientID: legacyClient.clientID,
    linkID: legacyLinked.linkID,
  };
  await rejected(() => crmAction(p, operator, legacyRevoke), 409);
  await rejected(() => crmAction(p, operator, { ...legacyRevoke, revokeLegacyAccess: true }), 400);
  assert.deepEqual(await databaseFingerprints(pool, externalBefore), externalBefore);
  assert.equal(
    (await p.findByID({ collection: "customer-inquiry-links", id: legacy.id })).active,
    true,
  );
  pass(
    "independent old customer authorization blocks revoke; no force parameter or external side effects",
  );
  const raceQ = await makeInquiry(),
    c = await makeClient("Race C"),
    d = await makeClient("Race D");
  const results = await Promise.allSettled(
    [c, d].map((x) =>
      crmAction(p, operator, {
        ...linkInput,
        operationKey: key(),
        clientID: x.clientID,
        inquiryID: raceQ.id,
        expectedClientRevision: 1,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason.status === 409));
  const auditSave = p.create.bind(p);
  p.create = (async (args: Parameters<typeof p.create>[0]) => {
    if (args.collection === "audit-events") throw Error("Injected link audit failure");
    return auditSave(args);
  }) as typeof p.create;
  const failureBefore = await fingerprints();
  const faultQ = await makeInquiry().catch(() => undefined);
  assert.equal(faultQ, undefined, "fixture audit also protected");
  assert.deepEqual(await fingerprints(), failureBefore);
  p.create = auditSave;
  const faultInquiry = await makeInquiry(),
    faultClient = await makeClient("Audit rollback");
  const faultInput = {
    ...linkInput,
    operationKey: key(),
    clientID: faultClient.clientID,
    inquiryID: faultInquiry.id,
    expectedClientRevision: 1,
  };
  const priorFault = await fingerprints();
  p.create = (async (args: Parameters<typeof p.create>[0]) => {
    if (args.collection === "audit-events") throw Error("Injected link audit failure");
    return auditSave(args);
  }) as typeof p.create;
  await assert.rejects(() => crmAction(p, operator, faultInput), /Injected link audit failure/);
  p.create = auditSave;
  assert.deepEqual(await fingerprints(), priorFault);
  const recovered = await crmAction(p, operator, faultInput);
  const commit = p.db.commitTransaction;
  let lost = false;
  p.db.commitTransaction = async (id) => {
    await commit.call(p.db, id);
    if (!lost) {
      lost = true;
      throw Error("Link committed response lost");
    }
  };
  const unknown = {
    ...revocation,
    operationKey: key(),
    clientID: faultClient.clientID,
    linkID: recovered.linkID,
  };
  await assert.rejects(() => crmAction(p, operator, unknown), /Link committed response lost/);
  p.db.commitTransaction = commit;
  assert.equal((await crmAction(p, operator, unknown)).revision, 2);
  pass(
    "two clients compete once; audit rollback and actual COMMIT response loss retain atomic idempotency",
  );
  const transferInquiry = await makeInquiry();
  const crmBeforeTransfer = (await fingerprints()).filter((t) => t.table.startsWith("crm_"));
  const block = await p.db.beginTransaction();
  assert.ok(block);
  const db = transactionSession(p, block).db;
  await db.execute("SELECT pg_advisory_xact_lock(726281)");
  const blockedBy = Number((await db.execute("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  const waiting = crmAction(p, operator, {
    ...linkInput,
    operationKey: key(),
    clientID: a.clientID,
    inquiryID: transferInquiry.id,
    expectedClientRevision: 3,
  });
  const deniedTransfer = assert.rejects(waiting, { status: 404 });
  const deadline = Date.now() + 10000;
  while (
    !(
      await pool.query(
        "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted " +
          "AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND $1=ANY(pg_blocking_pids(pid))",
        [blockedBy],
      )
    ).rowCount
  ) {
    assert.ok(Date.now() < deadline, "observe exact blocker before reassignment");
    await new Promise((r) => setTimeout(r, 10));
  }
  await p.update({
    collection: "inquiries",
    id: transferInquiry.id,
    data: { owner: other.id },
    req: { user, transactionID: block },
  });
  await p.db.commitTransaction(block);
  await deniedTransfer;
  assert.deepEqual(await databaseFingerprints(pool, crmBeforeTransfer), crmBeforeTransfer);
  await p.update({ collection: "staff", id: op.id, data: { team: foreignTeam.id }, req: { user } });
  await rejected(() => crmAction(p, operator, linkInput), 404);
  await rejected(() => crmAction(p, operator, selfCreate), 404);
  await rejected(
    () =>
      crmAction(p, operator, {
        action: "updateClient",
        operationKey: key(),
        clientID: a.clientID,
        expectedRevision: 3,
        displayName: "Forged after transfer",
      }),
    404,
  );
  await p.update({ collection: "staff", id: op.id, data: { team: team.id }, req: { user } });
  pass(
    "actual PG wait/reassignment barrier and operations-role team transfer reject stale writes/replay",
  );
  await p.update({ collection: "inquiries", id: q.id, data: { owner: other.id }, req: { user } });
  const hiddenList = await crmRead(p, operator, {
    action: "linkedInquiries",
    clientID: b.clientID,
  });
  assert.ok("items" in hiddenList && hiddenList.total === 0);
  const visibleList = await crmRead(p, actor(manager), {
    action: "linkedInquiries",
    clientID: b.clientID,
  });
  assert.ok("items" in visibleList && visibleList.total === 1);
  await rejected(
    async () =>
      crmAction(p, operator, {
        action: "archiveClient",
        operationKey: key(),
        clientID: b.clientID,
        expectedRevision: await rootRevision(b.clientID),
        reason: "Attempt hidden link archive",
      }),
    409,
  );
  pass(
    "reassignment hides counts and service projection but hidden active association still blocks archive",
  );
  for (let n = 0; n < 201; n++) await makeInquiry(op.id, team.id, `Bulk candidate ${n}`);
  const bulk = await crmRead(p, operator, {
    action: "inquiryCandidates",
    clientID: a.clientID,
    q: "Bulk candidate",
    page: 5,
    limit: 50,
  });
  assert.ok("items" in bulk && bulk.total === 201 && bulk.items.length === 1);
  const deniedBulk = await crmRead(p, actor(other), {
    action: "inquiryCandidates",
    clientID: (await makeClient("Other-owned", other.id)).clientID,
    q: "Bulk candidate",
  });
  assert.ok("items" in deniedBulk && deniedBulk.total === 0);
  pass("candidate pagination beyond 200 has correct scope-filtered total and final page");
  const authQ = await makeInquiry(),
    authClient = await makeClient("Grant race");
  const authLinked = await crmAction(p, operator, {
    ...linkInput,
    operationKey: key(),
    clientID: authClient.clientID,
    inquiryID: authQ.id,
    expectedClientRevision: 1,
  });
  const crmBeforeGrant = (await fingerprints()).filter((t) => t.table.startsWith("crm_"));
  const grantBlock = await p.db.beginTransaction();
  assert.ok(grantBlock);
  await transactionSession(p, grantBlock).db.execute("SELECT pg_advisory_xact_lock(726281)");
  const grant = linkCustomerInquiry(p, operator, {
    inquiryID: authQ.id,
    email: account.email,
    reason: "Explicit independent customer identity evidence",
  });
  const observe = async (count: number) => {
    const until = Date.now() + 10000;
    while (
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
          )
        ).rows[0].count,
      ) < count
    ) {
      assert.ok(Date.now() < until, "observe real legacy grant/revoke lock waiters");
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  await observe(1);
  const failedRevoke = assert.rejects(
    () =>
      crmAction(p, operator, {
        ...revocation,
        operationKey: key(),
        clientID: authClient.clientID,
        linkID: authLinked.linkID,
      }),
    { status: 409 },
  );
  await observe(2);
  await p.db.commitTransaction(grantBlock);
  await grant;
  await failedRevoke;
  assert.deepEqual(await databaseFingerprints(pool, crmBeforeGrant), crmBeforeGrant);
  assert.equal(
    (
      await p.find({
        collection: "customer-inquiry-links",
        where: { and: [{ inquiry: { equals: authQ.id } }, { active: { equals: true } }] },
      })
    ).totalDocs,
    1,
  );
  pass(
    "real legacy authorization service commits before waiting revoke; lock recheck preserves grant and CRM",
  );
  const beforeDown = await fingerprints();
  await assert.rejects(() => migrate(down), /Preserve CRM inquiry/);
  assert.deepEqual(await fingerprints(), beforeDown);
  const history = await pool.connect();
  try {
    await history.query("BEGIN");
    await history.query("UPDATE crm_inquiry_links SET active=false");
    await assert.rejects(
      () =>
        down({ db: { execute: (sql: string) => history.query(sql) } } as unknown as Parameters<
          typeof down
        >[0]),
      /Preserve CRM inquiry/,
    );
  } finally {
    await history.query("ROLLBACK");
    history.release();
  }
  assert.deepEqual(await fingerprints(), beforeDown);
  await assert.rejects(() => pool.query("DELETE FROM inquiries WHERE id=$1", [q.id]));
  const privateConfig = p.config.collections.find((c) => c.slug === "crm-inquiry-links");
  assert.equal(privateConfig?.endpoints, false);
  assert.equal(privateConfig?.graphQL, false);
  await rejected(
    () => p.find({ collection: "crm-inquiry-links", user, overrideAccess: false }),
    403,
  );
  pass("active or revoked history blocks rollback; RESTRICT and generic access protections hold");
  console.log(`CRM inquiry association integration: ${checks} groups passed`);
} finally {
  await p.destroy();
}
process.exit(0);
