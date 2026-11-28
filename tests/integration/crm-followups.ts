import { transactionSession } from "../../src/server/db-types";
import { executeFollowup } from "../../src/server/crm/followups";
import { changeInquiryStatus } from "../../src/server/inquiry-status";
import { followupList } from "../../src/server/crm/followup-read";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { up, down } from "../../src/migrations/20261128_170000_crm_followups";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const config = (await import("../../src/payload.config")).default;
const p = await getPayload({ config });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
let checks = 0;
const pass = (s: string) => console.log(`PASS C1 ${++checks}: ${s}`);
async function migration(fn: typeof up, rollback = false) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await fn({ db: { execute: (s: string) => db.query(s) } } as unknown as Parameters<
      typeof up
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
  const before = await databaseFingerprints(pool);
  await migration(down);
  await migration(up);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  pass("empty migration down/up preserves existing tables");
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "C1 admin",
      email: "c1-admin@example.invalid",
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const user = { ...admin, collection: "staff" as const };
  const team = await p.create({ collection: "teams", data: { name: "C1 team" } });
  const client = await p.create({
    collection: "crm-clients",
    data: {
      reference: key(),
      kind: "company",
      displayName: "Fictional C1",
      language: "zh",
      team: team.id,
      status: "active",
      revision: 1,
    },
  });
  const task = await p.create({
    collection: "crm-followups",
    data: {
      reference: key(),
      anchorKind: "client",
      client: client.id,
      type: "adhoc",
      title: "Call",
      description: "",
      dueAt: "2026-11-28T01:00:00Z",
      state: "pending",
      revision: 1,
      needsReview: false,
      createdBy: admin.id,
    },
  });
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET client_id=NULL WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET revision=1.5 WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET due_at='infinity' WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET state='completed' WHERE id=$1", [task.id]),
  );
  await p.create({
    collection: "crm-followup-events",
    data: {
      task: task.id,
      seq: 1,
      action: "created",
      actor: admin.id,
      serverTime: new Date().toISOString(),
      details: { revision: 1 },
    },
  });
  await assert.rejects(() =>
    p.create({
      collection: "crm-followup-events",
      data: {
        task: task.id,
        seq: 1,
        action: "created",
        actor: admin.id,
        serverTime: new Date().toISOString(),
        details: {},
      },
    }),
  );
  await assert.rejects(() => migration(down));
  await assert.rejects(() => p.delete({ collection: "crm-clients", id: client.id }));
  await assert.rejects(
    () => p.find({ collection: "crm-followups", overrideAccess: false, user, depth: 0 }),
    { status: 403 },
  );
  pass("database constraints and private access preserve history");

  const req = { user };
  const makeStaff = (
    name: string,
    role: "operations" | "manager" | "editor" | "reviewer",
    teamID = team.id,
  ) =>
    p.create({
      collection: "staff",
      req,
      data: {
        name,
        email: `c1-${name}@example.invalid`,
        password: key(),
        role,
        active: true,
        team: teamID,
      },
    });
  const op = await makeStaff("op", "operations");
  const other = await makeStaff("other", "operations");
  const manager = await makeStaff("manager", "manager");
  const editor = await makeStaff("editor", "editor");
  const reviewer = await makeStaff("reviewer", "reviewer");
  const foreignTeam = await p.create({ collection: "teams", data: { name: "C1 foreign" } });
  const foreign = await makeStaff("foreign", "manager", foreignTeam.id);
  const asUser = (s: typeof op) => ({ ...s, collection: "staff" as const });
  await p.update({ collection: "crm-clients", id: client.id, data: { owner: op.id } });
  const firstPage = await followupList(p, asUser(op), { kind: "client", id: client.id });
  assert.equal(firstPage.total, 1);
  assert.equal(firstPage.items[0].needsAssignment, true);
  assert.equal(firstPage.items[0].anchorID, client.id);
  for (const denied of [other, foreign])
    await assert.rejects(() => followupList(p, asUser(denied), { kind: "client", id: client.id }), {
      status: 404,
    });
  for (const denied of [editor, reviewer])
    await assert.rejects(() => followupList(p, asUser(denied), { kind: "client", id: client.id }), {
      status: 403,
    });
  assert.equal(
    (await followupList(p, asUser(manager), { kind: "client", id: client.id })).total,
    1,
  );
  const inquiry = await p.create({
    collection: "inquiries",
    req,
    data: {
      reference: key(),
      requestKey: key(),
      contentHash: key(),
      categories: ["business"],
      city: "Shanghai",
      name: "C1 fictional inquiry",
      email: "c1-inquiry@example.invalid",

      team: team.id,
      owner: other.id,
      status: "new",
    },
  });
  const hidden = await p.create({
    collection: "crm-followups",
    data: {
      reference: key(),
      anchorKind: "inquiry",
      inquiry: inquiry.id,
      type: "adhoc",
      title: "Hidden",
      dueAt: "2026-11-28T01:00:00Z",
      state: "pending",
      revision: 1,
      needsReview: false,
      createdBy: admin.id,
      assignee: other.id,
    },
  });
  await p.create({
    collection: "crm-inquiry-links",
    data: {
      client: client.id,
      inquiry: inquiry.id,
      active: true,
      revision: 1,
      linkedBy: admin.id,
      linkedAt: new Date().toISOString(),
      reason: "Fictional association",
    },
  });
  const visible = await followupList(p, asUser(op), { kind: "client", id: client.id });
  await p.update({
    collection: "crm-followups",
    id: hidden.id,
    data: { title: "Changed invisible item" },
  });
  const afterHidden = await followupList(p, asUser(op), { kind: "client", id: client.id });
  assert.deepEqual({ ...afterHidden, asOf: visible.asOf }, visible);
  assert.equal(
    (await followupList(p, asUser(other), { kind: "inquiry", id: inquiry.id })).total,
    1,
  );
  pass("current roles, dual scopes and hidden-object read isolation");

  const context = { kind: "client" as const, id: client.id, revision: 1 };
  const create = {
    action: "createFollowup",
    context,
    operationKey: key(),
    title: "Discuss needs",
    dueAt: "2026-11-28T02:00:00Z",
    assigneeID: op.id,
  };
  const created = await executeFollowup(p, asUser(op), create);
  assert.equal(created.changedCount, 1);
  const id = created.tasks[0].taskID;
  const snapshot = await databaseFingerprints(pool);
  assert.deepEqual(await executeFollowup(p, asUser(op), create), created);
  assert.deepEqual(await databaseFingerprints(pool), snapshot);
  await assert.rejects(() => executeFollowup(p, asUser(op), { ...create, title: "Different" }), {
    status: 409,
  });
  const action = {
    action: "completeFollowup",
    context,
    operationKey: key(),
    taskID: id,
    expectedRevision: 1,
    body: "Called and agreed next discussion",
    continuation: {
      kind: "create",
      title: "Second discussion",
      dueAt: "2026-11-30T02:00:00Z",
      assigneeID: op.id,
    },
  };
  await assert.rejects(() => executeFollowup(p, asUser(manager), action), { status: 403 });
  const concurrent = await Promise.allSettled([
    executeFollowup(p, asUser(op), action),
    executeFollowup(p, asUser(op), { ...action, operationKey: key() }),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  const receipt = concurrent.find((r) => r.status === "fulfilled");
  assert.ok(receipt && receipt.status === "fulfilled");
  assert.equal(receipt.value.changedCount, 2);
  const completed = await p.findByID({ collection: "crm-followups", id });
  assert.equal(completed.state, "completed");
  assert.ok(completed.terminalAt);
  const nextID = receipt.value.tasks.find((v) => v.taskID !== id)!.taskID;
  await assert.rejects(
    () =>
      executeFollowup(p, asUser(op), {
        action: "postponeFollowup",
        context,
        operationKey: key(),
        taskID: id,
        expectedRevision: 2,
        dueAt: "2026-12-01T02:00:00Z",
        reason: "Cannot resurrect completed task",
      }),
    { status: 409 },
  );
  const oldInput = await pool.query("SELECT next_follow_up,follow_ups FROM inquiries WHERE id=$1", [
    inquiry.id,
  ]);
  assert.equal((await p.count({ collection: "crm-followup-slots" })).totalDocs, 0);
  pass("atomic completion continuation, idempotence and manager cannot substitute assignee");

  const inquiryDoc = await p.findByID({ collection: "inquiries", id: inquiry.id });
  const ic = { kind: "inquiry" as const, id: inquiry.id, updatedAt: inquiryDoc.updatedAt };
  const iqTask = await executeFollowup(p, asUser(other), {
    ...create,
    context: ic,
    assigneeID: other.id,
    operationKey: key(),
  });
  const iqID = iqTask.tasks[0].taskID;
  await changeInquiryStatus(p, user, {
    id: inquiry.id,
    action: "close",
    key: key(),
    updatedAt: inquiryDoc.updatedAt,
    reason: "Pause fictional inquiry",
  });
  const closed = await p.findByID({ collection: "inquiries", id: inquiry.id });
  const paused = await followupList(p, asUser(other), { kind: "inquiry", id: inquiry.id });
  assert.ok(paused.items.every((t) => t.suspended));
  await assert.rejects(
    () =>
      executeFollowup(p, asUser(other), {
        action: "confirmFollowupReview",
        context: { ...ic, updatedAt: closed.updatedAt },
        taskID: iqID,
        expectedRevision: 2,
        operationKey: key(),
      }),
    { status: 409 },
  );
  await changeInquiryStatus(p, user, {
    id: inquiry.id,
    action: "reopen",
    key: key(),
    updatedAt: closed.updatedAt,
    reason: "Resume fictional inquiry",
    status: "new",
    coordinationStage: "received",
  });
  const reopened = await p.findByID({ collection: "inquiries", id: inquiry.id });
  const reopenedTask = await p.findByID({ collection: "crm-followups", id: iqID });
  assert.equal(reopenedTask.needsReview, true);
  const ic2 = { ...ic, updatedAt: reopened.updatedAt };
  await assert.rejects(
    () =>
      executeFollowup(p, asUser(other), {
        action: "postponeFollowup",
        context: ic2,
        operationKey: key(),
        taskID: iqID,
        expectedRevision: reopenedTask.revision,
        dueAt: "2026-12-02T01:00:00Z",
        reason: "First need review after reopening",
      }),
    { status: 409 },
  );
  await executeFollowup(p, asUser(other), {
    action: "confirmFollowupReview",
    context: ic2,
    operationKey: key(),
    taskID: iqID,
    expectedRevision: reopenedTask.revision,
  });
  assert.deepEqual(
    (await pool.query("SELECT next_follow_up,follow_ups FROM inquiries WHERE id=$1", [inquiry.id]))
      .rows,
    oldInput.rows,
  );
  pass("close/reopen suspends pending and forces explicit review without old-source writes");

  // Real transaction failure at the last persistence step must undo task/event/audit.
  await pool.query(
    "CREATE FUNCTION c1_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='postponeFollowup' THEN RAISE EXCEPTION 'C1 injected receipt failure'; END IF; RETURN NEW; END $$",
  );
  await pool.query(
    "CREATE TRIGGER c1_fail_receipt BEFORE INSERT ON crm_operations FOR EACH ROW EXECUTE FUNCTION c1_fail_receipt()",
  );
  const beforeFailure = await databaseFingerprints(pool);
  await assert.rejects(() =>
    executeFollowup(p, asUser(op), {
      action: "postponeFollowup",
      context,
      operationKey: key(),
      taskID: nextID,
      expectedRevision: 1,
      dueAt: "2026-12-02T01:00:00Z",
      reason: "Need a different deadline",
    }),
  );
  assert.deepEqual(await databaseFingerprints(pool), beforeFailure);
  await pool.query(
    "DROP TRIGGER c1_fail_receipt ON crm_operations; DROP FUNCTION c1_fail_receipt()",
  );
  pass("last receipt failure rolls back every table");

  const childNow = await p.findByID({ collection: "crm-followups", id: iqID });
  const childAction = {
    action: "postponeFollowup",
    context,
    taskID: iqID,
    expectedRevision: childNow.revision,
    operationKey: key(),
    expectedInquiryUpdatedAt: inquiryDoc.updatedAt,
    expectedLinkRevision: 1,
    dueAt: "2026-12-03T01:00:00Z",
    reason: "Stale parent snapshot must reject",
  };
  await assert.rejects(() => executeFollowup(p, asUser(manager), childAction), { status: 409 });
  pass("CRM child actions require current inquiry and association preview versions");

  const noWrite = async (fn: () => Promise<unknown>, status: number) => {
    const before = await databaseFingerprints(pool);
    await assert.rejects(fn, { status });
    assert.deepEqual(await databaseFingerprints(pool), before);
  };
  // Same-team parent change never silently transfers tasks.
  await p.update({
    collection: "crm-clients",
    id: client.id,
    req,
    data: { owner: other.id, revision: 2 },
  });
  const transferredContext = { ...context, revision: 2 };
  const otherCreated = await executeFollowup(p, asUser(manager), {
    ...create,
    context: transferredContext,
    operationKey: key(),
    assigneeID: other.id,
  });
  const noOpID = otherCreated.tasks[0].taskID;
  const assign = {
    action: "assignFollowups",
    context: transferredContext,
    assigneeID: other.id,
    operationKey: key(),
    tasks: [
      { taskID: nextID, expectedRevision: 1 },
      { taskID: noOpID, expectedRevision: 1 },
    ],
  };
  const assigned = await executeFollowup(p, asUser(manager), assign);
  assert.equal(assigned.changedCount, 1);
  assert.deepEqual(assigned.tasks, [{ taskID: nextID, revision: 2 }]);
  await noWrite(
    () =>
      executeFollowup(p, asUser(manager), {
        ...assign,
        operationKey: key(),
        tasks: [{ taskID: nextID, expectedRevision: 2 }],
      }),
    409,
  );
  await noWrite(() => executeFollowup(p, asUser(op), create), 404);
  await noWrite(
    () =>
      executeFollowup(p, asUser(manager), {
        ...assign,
        operationKey: key(),
        assigneeID: manager.id,
        tasks: [{ taskID: nextID, expectedRevision: 2 }],
      }),
    403,
  );
  await noWrite(
    () =>
      executeFollowup(p, asUser(manager), {
        ...assign,
        operationKey: key(),
        tasks: [
          { taskID: task.id, expectedRevision: 1 },
          { taskID: noOpID, expectedRevision: 999 },
        ],
      }),
    409,
  );
  const note = await executeFollowup(p, asUser(other), {
    action: "appendFollowupNote",
    context: transferredContext,
    taskID: nextID,
    expectedRevision: 2,
    operationKey: key(),
    body: "Actual execution note",
  });
  await executeFollowup(p, asUser(manager), {
    action: "cancelFollowup",
    context: transferredContext,
    taskID: nextID,
    expectedRevision: note.tasks[0].revision,
    operationKey: key(),
    management: true,
    reason: "Management correction, no completion",
  });
  pass("explicit same-team assignment, actual subset counts, all-no-op and atomic stale batch");

  const cap = await p.create({
    collection: "crm-clients",
    data: {
      reference: key(),
      kind: "individual",
      displayName: "C1 cap",
      language: "zh",
      team: team.id,
      owner: other.id,
      status: "active",
      revision: 1,
    },
  });
  await pool.query(
    "INSERT INTO crm_followups(reference,anchor_kind,client_id,type,title,due_at,state,revision,created_by_id,assignee_id) " +
      "SELECT 'CAP-'||$1||'-'||n,'client',$2,'adhoc','Cap',now(),'pending',1,$3,$4 FROM generate_series(1,50) n",
    [key().slice(0, 8), cap.id, admin.id, other.id],
  );
  const capContext = { kind: "client" as const, id: cap.id, revision: 1 };
  await noWrite(
    () =>
      executeFollowup(p, asUser(other), {
        ...create,
        operationKey: key(),
        context: capContext,
        assigneeID: other.id,
      }),
    409,
  );
  const capList = await followupList(p, asUser(other), { kind: "client", id: cap.id }, 2, 20);
  assert.equal(capList.total, 50);
  assert.equal(capList.items.length, 20);
  const capDone = await executeFollowup(p, asUser(other), {
    ...action,
    context: capContext,
    taskID: capList.items[0].id,
    operationKey: key(),
    continuation: {
      kind: "create",
      title: "Replacement at cap",
      dueAt: "2026-12-01T02:00:00Z",
      assigneeID: other.id,
    },
  });
  assert.equal(capDone.changedCount, 2);
  assert.equal(
    (
      await p.count({
        collection: "crm-followups",
        where: { and: [{ client: { equals: cap.id } }, { state: { equals: "pending" } }] },
      })
    ).totalDocs,
    50,
  );
  pass("50 pending cap, real paging and completion may atomically replace at cap");

  // Fail the second operation after the completion was already saved.
  const beforeNextFailure = await databaseFingerprints(pool);
  await assert.rejects(
    () =>
      executeFollowup(p, asUser(other), {
        ...action,
        context: transferredContext,
        operationKey: key(),
        taskID: noOpID,
        continuation: {
          kind: "create",
          title: "Invalid next owner",
          dueAt: "2026-12-01T02:00:00Z",
          assigneeID: manager.id,
        },
      }),
    { status: 403 },
  );
  assert.deepEqual(await databaseFingerprints(pool), beforeNextFailure);
  const commit = p.db.commitTransaction;
  let lost = false;
  const uncertain = {
    ...create,
    context: transferredContext,
    operationKey: key(),
    assigneeID: other.id,
  };
  p.db.commitTransaction = async (id) => {
    await commit.call(p.db, id);
    if (!lost) {
      lost = true;
      throw Error("C1 committed response lost");
    }
  };
  try {
    await assert.rejects(
      () => executeFollowup(p, asUser(other), uncertain),
      /C1 committed response lost/,
    );
  } finally {
    p.db.commitTransaction = commit;
  }
  const committed = await databaseFingerprints(pool);
  const recovered = await executeFollowup(p, asUser(other), uncertain);
  assert.equal(recovered.changedCount, 1);
  assert.deepEqual(await databaseFingerprints(pool), committed);
  pass("failed continuation rolls back; real COMMIT response loss recovers exactly once");

  const lock = await p.db.beginTransaction();
  assert.ok(lock);
  await transactionSession(p, lock).db.execute("SELECT pg_advisory_xact_lock(726281)");
  const blocked = executeFollowup(p, asUser(other), {
    ...create,
    context: transferredContext,
    operationKey: key(),
    assigneeID: other.id,
  });
  const denied = assert.rejects(blocked, { status: 403 });
  const deadline = Date.now() + 10000;
  while (
    !(
      await pool.query(
        "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
      )
    ).rowCount
  ) {
    assert.ok(Date.now() < deadline);
    await new Promise((r) => setTimeout(r, 10));
  }
  await p.update({
    collection: "staff",
    id: other.id,
    req: { user, transactionID: lock },
    data: { active: false },
  });
  await p.db.commitTransaction(lock);
  const revoked = await databaseFingerprints(pool);
  await denied;
  assert.deepEqual(await databaseFingerprints(pool), revoked);
  await p.update({ collection: "staff", id: other.id, req, data: { active: true } });
  pass("actual business-lock wait rechecks current actor with zero side effects");
} finally {
  await p.destroy();
}

process.exit(0);
