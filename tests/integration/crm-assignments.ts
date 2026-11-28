import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Staff } from "../../payload-types";
import type {
  TransferInput,
  TransferPreview,
  TransferReceipt,
  AssignmentRead,
} from "../../src/lib/crm-assignments";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { crmAction } from "../../src/server/crm/service";
import { crmRead } from "../../src/server/crm/read";
import { transactionSession } from "../../src/server/db-types";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const mod = await import("../../src/server/crm/assignment-read");
assert.ok("crmAssignmentsRead" in mod);
const { getPayload } = await import("payload");
const p = await getPayload({ config: (await import("../../src/payload.config")).default });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
const actor = (s: Staff) => ({ ...s, collection: "staff" as const });
let checks = 0;
const pass = (s: string) => console.log(`PASS CRM assignments ${++checks}: ${s}`);
const fingerprints = () => databaseFingerprints(pool);
async function rejected(fn: () => Promise<unknown>, status: number) {
  const before = await fingerprints();
  await assert.rejects(fn, { status });
  assert.deepEqual(await fingerprints(), before);
}
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Transfer admin",
      email: key() + "@example.invalid",
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const root = actor(admin),
    team = await p.create({ collection: "teams", data: { name: "Transfer team" } }),
    ft = await p.create({ collection: "teams", data: { name: "Foreign transfer team" } });
  const staff = (role: "operations" | "manager" | "editor", t = team.id) =>
    p.create({
      collection: "staff",
      req: { user: root },
      data: {
        name: "Transfer " + role,
        email: key() + "@example.invalid",
        password: key(),
        role,
        team: t,
        active: true,
      },
    });
  const op = await staff("operations"),
    next = await staff("operations"),
    third = await staff("operations"),
    manager = await staff("manager"),
    foreign = await staff("operations", ft.id),
    editor = await staff("editor");
  const dual = await p.update({
    collection: "staff",
    id: editor.id,
    req: { user: root },
    data: { additionalRoles: ["operations"] },
  });
  const makeClient = async (owner = op.id, t = team.id) =>
    (
      await crmAction(p, root, {
        action: "createClient",
        operationKey: key(),
        kind: "company",
        displayName: "Transfer fictional client",
        language: "en",
        teamID: t,
        ownerID: owner,
      })
    ).clientID;
  const clientID = await makeClient(),
    foreignClient = await makeClient(foreign.id, ft.id);
  const client = async (cid = clientID) => {
    const c = await crmRead(p, root, { action: "get", clientID: cid });
    assert.ok("revision" in c);
    return c;
  };
  const inquiry = (owner = op.id) =>
    p.create({
      collection: "inquiries",
      req: { user: root },
      data: {
        reference: "TR-" + key(),
        requestKey: key(),
        contentHash: key(),
        name: "Virtual transfer inquiry",
        email: "transfer-private@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        status: "new",
        owner,
        team: team.id,
      },
    });
  const a = await inquiry(),
    b = await inquiry(third.id),
    done = await inquiry(),
    closed = await inquiry();
  const link = async (id: number, cid = clientID) =>
    crmAction(p, root, {
      action: "linkInquiry",
      clientID: cid,
      inquiryID: id,
      expectedClientRevision: (await client(cid)).revision,
      expectedLinkRevision: 0,
      reason: "Virtual reviewed transfer association",
      operationKey: key(),
    });

  await link(a.id);
  await link(b.id);
  await link(done.id);
  await link(closed.id);
  await pool.query("UPDATE inquiries SET status='closed' WHERE id=$1", [closed.id]);
  const service = await p.create({
    collection: "service-cases",
    data: {
      inquiry: a.id,
      title: "Transfer case",
      stage: "quoting",
      revision: 1,
      internalArrangement: "PRIVATE-CANARY",
    },
  });
  await p.create({
    collection: "service-cases",
    data: { inquiry: done.id, title: "Completed case", stage: "completed", revision: 1 },
  });
  const read = (user: Staff, input: Record<string, unknown>) =>
    mod.crmAssignmentsRead(p, actor(user), input);
  const preview = (user = manager) =>
    read(user, { action: "transferPreview", clientID }) as Promise<TransferPreview>;
  const before = await fingerprints(),
    view = await preview();
  assert.equal(view.clientID, clientID);
  assert.equal(view.total, 2);
  assert.deepEqual(new Set(view.inquiries.map((i) => i.inquiryID)), new Set([a.id, b.id]));
  assert.ok(view.receivers.some((s) => s.id === dual.id));
  assert.ok(!view.receivers.some((s) => s.id === foreign.id));
  assert.equal(JSON.stringify(view).includes("@example.invalid"), false);
  assert.equal(JSON.stringify(view).includes("PRIVATE-CANARY"), false);
  assert.deepEqual(await fingerprints(), before);
  await rejected(() => preview(op), 403);
  await rejected(() => read(manager, { action: "transferPreview", clientID: foreignClient }), 404);
  assert.equal(
    (
      (await read(manager, { action: "assignmentHistory", clientID })) as Exclude<
        AssignmentRead,
        TransferPreview
      >
    ).total,
    0,
  );
  pass(
    "READ ONLY preview scopes eligible inquiries and same-team active operations, safe fields and empty history",
  );
  const proposal = async (
    ids = [a.id],
    transferClient = false,
    recipientID = next.id,
    forClientID = clientID,
  ): Promise<TransferInput> => {
    const inquiries = await Promise.all(
      ids.map(async (inquiryID) => {
        const q = await p.findByID({ collection: "inquiries", id: inquiryID, depth: 0 });
        const cases = await p.find({
          collection: "service-cases",
          where: { inquiry: { equals: inquiryID } },
          depth: 0,
          limit: 1,
        });
        return {
          inquiryID,
          expectedUpdatedAt: q.updatedAt,
          expectedOwnerID: typeof q.owner === "number" ? q.owner : null,
          expectedCaseRevision: cases.docs[0]?.revision ?? null,
        };
      }),
    );
    return {
      action: "transferAssignments",
      operationKey: key(),
      clientID: forClientID,
      expectedClientRevision: (await client(forClientID)).revision,
      recipientID,
      transferClient,
      inquiries,
      reason: "Fictional reviewed responsibility transfer",
    };
  };
  const account = await p.create({
    collection: "customer-accounts",
    data: { email: key() + "@example.invalid", active: true, verifiedAt: new Date().toISOString() },
  });
  await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: account.id,
      inquiry: a.id,
      active: true,
      dedupe: `${account.id}:${a.id}`,
      verifiedBy: admin.id,
      verifiedAt: new Date().toISOString(),
      verificationReason: "Independent fictional authorization",
    },
  });
  const protectedTables = new Set([
    "service_cases",
    "service_quotes",
    "service_quote_line_costs",
    "crm_inquiry_links",
    "crm_contacts",
    "customer_accounts",
    "customer_inquiry_links",
  ]);
  const protectedFingerprint = async () =>
    (await fingerprints()).filter((t) => protectedTables.has(t.table));
  const commitTransfer = async (input: TransferInput, user = manager) => {
    const before = await protectedFingerprint();
    const r = await crmAction(p, actor(user), input);
    assert.deepEqual(await protectedFingerprint(), before);
    return r as TransferReceipt;
  };
  const first = await proposal();
  const transferred = await commitTransfer(first);
  assert.equal(transferred.clientID, clientID);
  assert.equal((await client()).ownerID, op.id);
  assert.equal((await p.findByID({ collection: "inquiries", id: a.id, depth: 0 })).owner, next.id);
  pass(
    "only selected inquiry transfers through original business hooks; client owner stays unchanged",
  );

  const history = (await read(manager, { action: "assignmentHistory", clientID })) as Exclude<
    AssignmentRead,
    TransferPreview
  >;
  assert.equal(history.total, 1);
  assert.deepEqual(history.items[0].inquiryIDs, [a.id]);
  assert.equal(JSON.stringify(history).includes(first.reason), false);
  assert.deepEqual(
    Object.keys(history.items[0]).sort(),
    ["id", "time", "actorName", "recipientName", "transferredClient", "inquiryIDs"].sort(),
  );
  pass(
    "safe transfer history projects only current authorized targets without reason or raw audit",
  );
  for (const result of [
    { ...transferred, transferID: 0 },
    { ...transferred, revision: 0 },
    { ...transferred, inquiryIDs: [a.id, a.id] },
    { ...transferred, transferredClient: false, inquiryIDs: [] },
  ]) {
    await pool.query("UPDATE crm_operations SET result=$2::jsonb WHERE operation_key=$1", [
      first.operationKey,
      JSON.stringify(result),
    ]);
    try {
      await rejected(() => crmAction(p, actor(manager), first), 503);
    } finally {
      await pool.query("UPDATE crm_operations SET result=$2::jsonb WHERE operation_key=$1", [
        first.operationKey,
        JSON.stringify(transferred),
      ]);
    }
  }
  pass("invalid persisted transfer receipt IDs, versions, duplicate or empty results fail closed");
  assert.ok(transferred.transferID > 0);
  assert.deepEqual(transferred.inquiryIDs, [a.id]);
  const firstReplayFingerprint = await fingerprints();
  assert.deepEqual(await crmAction(p, actor(manager), first), transferred);
  assert.deepEqual(await fingerprints(), firstReplayFingerprint);
  await rejected(
    async () => crmAction(p, actor(manager), { ...first, reason: "A different reviewed reason" }),
    409,
  );
  const onlyClient = await proposal([], true, next.id);
  const beforeBusiness = await pool.query(
    "SELECT id,owner_id,updated_at FROM inquiries ORDER BY id",
  );
  await commitTransfer(onlyClient);
  assert.deepEqual(
    (await pool.query("SELECT id,owner_id,updated_at FROM inquiries ORDER BY id")).rows,
    beforeBusiness.rows,
  );
  await rejected(() => crmRead(p, actor(op), { action: "get", clientID }), 404);
  const oldOwnerInquiry = await p.find({
    collection: "inquiries",
    where: { id: { equals: b.id } },
    user: actor(third),
    overrideAccess: false,
    depth: 0,
  });
  assert.equal(oldOwnerInquiry.totalDocs, 1);
  await rejected(() => crmRead(p, actor(third), { action: "get", clientID }), 404);
  pass(
    "client-only transfer preserves all business owners; old business owner gains no CRM access; replay writes zero",
  );
  const mixed = await proposal([b.id, a.id], true, third.id);
  const bBefore = (await p.findByID({ collection: "inquiries", id: b.id, depth: 0 })).updatedAt;
  const mixedReceipt = await commitTransfer(mixed);
  assert.equal(mixedReceipt.transferredClient, true);
  assert.deepEqual(mixedReceipt.inquiryIDs, [a.id]);
  assert.equal(
    (await p.findByID({ collection: "inquiries", id: b.id, depth: 0 })).updatedAt,
    bBefore,
  );
  assert.deepEqual(
    await crmAction(p, actor(manager), { ...mixed, inquiries: [...mixed.inquiries].reverse() }),
    mixedReceipt,
  );
  await rejected(
    async () => crmAction(p, actor(manager), await proposal([a.id, b.id], true, third.id)),
    409,
  );
  await rejected(async () => crmAction(p, actor(op), onlyClient), 403);
  await rejected(async () => crmAction(p, root, await proposal([], true, foreign.id)), 400);
  await rejected(async () => crmAction(p, actor(manager), await proposal([done.id])), 409);
  await rejected(async () => crmAction(p, actor(manager), await proposal([closed.id])), 409);
  const unlinked = await inquiry();
  await rejected(async () => crmAction(p, actor(manager), await proposal([unlinked.id])), 404);
  const stale = await proposal();
  stale.expectedClientRevision--;
  await rejected(async () => crmAction(p, actor(manager), stale), 409);
  pass(
    "mixed selection changes only real targets; normalized order replays, all-no-op and unauthorized selections reject atomically",
  );
  const newCaseInput = await proposal([b.id]);
  await p.create({
    collection: "service-cases",
    data: { inquiry: b.id, title: "Created after preview", stage: "discovery", revision: 1 },
  });
  await rejected(async () => crmAction(p, actor(manager), newCaseInput), 409);
  const changedCaseInput = await proposal([a.id]);
  await p.update({ collection: "service-cases", id: service.id, data: { revision: 2 } });
  await rejected(async () => crmAction(p, actor(manager), changedCaseInput), 409);
  const changedOwnerInput = await proposal([a.id]);
  await p.update({
    collection: "inquiries",
    id: a.id,
    data: { owner: op.id },
    req: { user: root },
  });
  await rejected(async () => crmAction(p, actor(manager), changedOwnerInput), 409);
  const changedTimeInput = await proposal([a.id]);
  await pool.query(
    "UPDATE inquiries SET updated_at=updated_at+interval '1 millisecond' WHERE id=$1",
    [a.id],
  );
  await rejected(async () => crmAction(p, actor(manager), changedTimeInput), 409);
  assert.deepEqual(await crmAction(p, actor(manager), first), transferred);
  pass(
    "new case, changed case revision, legacy owner/time changes invalidate preview; old authorized receipt remains historical",
  );
  const archived = await makeClient();
  await crmAction(p, root, {
    action: "archiveClient",
    clientID: archived,
    expectedRevision: 1,
    reason: "Fictional archive for transfer guard",
    operationKey: key(),
  });
  await rejected(
    async () => crmAction(p, actor(manager), await proposal([], true, next.id, archived)),
    409,
  );
  await p.update({
    collection: "staff",
    id: next.id,
    data: { active: false },
    req: { user: root },
  });
  await rejected(async () => crmAction(p, root, await proposal([], true, next.id)), 400);
  assert.ok(!(await preview()).receivers.some((s) => s.id === next.id));
  assert.deepEqual(await crmAction(p, actor(manager), first), transferred);
  await p.update({ collection: "staff", id: next.id, data: { active: true }, req: { user: root } });
  const raceClient = await makeClient();
  const raceA = await proposal([], true, next.id, raceClient),
    raceB = await proposal([], true, third.id, raceClient);
  const race = await Promise.allSettled([
    crmAction(p, root, raceA),
    crmAction(p, actor(manager), raceB),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(race.some((r) => r.status === "rejected" && r.reason.status === 409));
  pass(
    "archived/inactive targets reject; two administrators of same revision can commit only once",
  );
  const waitForLock = async () => {
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
  };
  const waitQ = await inquiry();
  await link(waitQ.id, raceClient);
  for (const mode of ["recipient", "actor", "inquiry"]) {
    const input = await proposal([waitQ.id], false, next.id, raceClient);
    const block = await p.db.beginTransaction();
    assert.ok(block);
    await transactionSession(p, block).db.execute("SELECT pg_advisory_xact_lock(726281)");
    const pending = crmAction(p, actor(manager), input);
    const failure = assert.rejects(pending, {
      status: mode === "recipient" ? 400 : mode === "actor" ? 403 : 404,
    });
    await waitForLock();
    if (mode === "recipient")
      await p.update({
        collection: "staff",
        id: next.id,
        data: { active: false },
        req: { user: root, transactionID: block },
      });
    if (mode === "actor")
      await p.update({
        collection: "staff",
        id: manager.id,
        data: { role: "operations" },
        req: { user: root, transactionID: block },
      });
    if (mode === "inquiry")
      await p.update({
        collection: "inquiries",
        id: waitQ.id,
        data: { team: ft.id, owner: foreign.id },
        req: { user: root, transactionID: block },
      });
    await p.db.commitTransaction(block);
    const baseline = await fingerprints();
    await failure;
    assert.deepEqual(await fingerprints(), baseline);
    if (mode === "recipient")
      await p.update({
        collection: "staff",
        id: next.id,
        data: { active: true },
        req: { user: root },
      });
    if (mode === "actor")
      await p.update({
        collection: "staff",
        id: manager.id,
        data: { role: "manager" },
        req: { user: root },
      });
  }
  pass(
    "actual business-lock wait rechecks recipient activity, actor authority and inquiry team with zero writes",
  );
  const reboundInput = await proposal([b.id]);
  const reboundReceipt = await commitTransfer(reboundInput);
  const previousLink = (
    await p.find({
      collection: "crm-inquiry-links",
      where: { inquiry: { equals: b.id } },
      limit: 1,
      depth: 0,
    })
  ).docs[0];
  await crmAction(p, root, {
    action: "revokeInquiryLink",
    clientID,
    linkID: previousLink.id,
    expectedClientRevision: (await client()).revision,
    expectedRevision: previousLink.revision,
    reason: "Fictional independent association correction",
    operationKey: key(),
  });
  const newClient = await makeClient();
  await crmAction(p, root, {
    action: "linkInquiry",
    clientID: newClient,
    inquiryID: b.id,
    expectedClientRevision: 1,
    expectedLinkRevision: previousLink.revision + 1,
    reason: "Fictional reviewed new customer association",
    operationKey: key(),
  });
  await rejected(() => crmAction(p, actor(manager), reboundInput), 404);
  const oldHistory = (await read(manager, {
    action: "assignmentHistory",
    clientID,
    limit: 50,
  })) as Exclude<AssignmentRead, TransferPreview>;
  assert.ok(!oldHistory.items.some((e) => e.id === reboundReceipt.transferID));
  const extra = await inquiry();
  await link(extra.id);
  const partialInput = await proposal([a.id, extra.id]);
  const partialReceipt = await commitTransfer(partialInput);
  await p.update({
    collection: "inquiries",
    id: extra.id,
    data: { team: ft.id, owner: foreign.id },
    req: { user: root },
  });
  const partialHistory = (await read(manager, {
    action: "assignmentHistory",
    clientID,
    limit: 50,
  })) as Exclude<AssignmentRead, TransferPreview>;
  assert.deepEqual(
    partialHistory.items.find((e) => e.id === partialReceipt.transferID)?.inquiryIDs,
    [a.id],
  );
  await p.update({
    collection: "inquiries",
    id: a.id,
    data: { team: ft.id, owner: foreign.id },
    req: { user: root },
  });
  const hiddenHistory = (await read(manager, {
    action: "assignmentHistory",
    clientID,
    limit: 50,
  })) as Exclude<AssignmentRead, TransferPreview>;
  assert.ok(!hiddenHistory.items.some((e) => e.id === partialReceipt.transferID));
  assert.ok(hiddenHistory.items.some((e) => e.transferredClient && e.inquiryIDs.length === 0));
  await rejected(() => crmAction(p, actor(manager), first), 404);
  pass(
    "rebound association blocks original key; history filters current visible targets before event counts and paging",
  );
  const faultClient = await makeClient(),
    fq1 = await inquiry(),
    fq2 = await inquiry();
  await link(fq1.id, faultClient);
  await link(fq2.id, faultClient);
  const faultInput = await proposal([fq1.id, fq2.id], true, next.id, faultClient);
  for (const mode of ["last inquiry", "workflow", "audit", "receipt"]) {
    const originalUpdate = p.update,
      originalCreate = p.create;
    let events = 0;
    p.update = async function (args) {
      if (
        mode === "last inquiry" &&
        args.collection === "inquiries" &&
        "id" in args &&
        Number(args.id) === fq2.id
      )
        throw Error("Injected transfer last inquiry failure");
      return Reflect.apply(originalUpdate, p, [args]);
    } as typeof p.update;
    p.create = async function (args) {
      if (mode === "workflow" && args.collection === "workflow-events" && ++events === 2)
        throw Error("Injected transfer workflow failure");
      if (
        mode === "audit" &&
        args.collection === "audit-events" &&
        (args.data as { entity?: string }).entity === "crm"
      )
        throw Error("Injected transfer audit failure");
      if (mode === "receipt" && args.collection === "crm-operations")
        throw Error("Injected transfer receipt failure");
      return Reflect.apply(originalCreate, p, [args]);
    } as typeof p.create;
    const baseline = await fingerprints();
    try {
      await assert.rejects(() => crmAction(p, actor(manager), faultInput), /Injected transfer/);
    } finally {
      p.update = originalUpdate;
      p.create = originalCreate;
    }
    if (mode === "workflow") assert.equal(events, 2);
    assert.deepEqual(await fingerprints(), baseline);
  }
  pass("last selected write, second workflow, CRM audit and receipt failures roll back all tables");
  const begin = p.db.beginTransaction,
    find = p.find;
  let readCommitted = false;
  let testingReadOnly = false;
  p.db.beginTransaction = async function (...args) {
    const id = await Reflect.apply(begin, p.db, args);
    if (id)
      await transactionSession(p, id).db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    return id;
  } as typeof p.db.beginTransaction;
  p.find = async function (args) {
    if (args.collection === "staff" && args.req?.transactionID) {
      const state = await transactionSession(p, await args.req.transactionID).db.execute(
        "SHOW transaction_isolation",
      );
      assert.equal(state.rows[0].transaction_isolation, "read committed");
      readCommitted = true;
      if (testingReadOnly) {
        const db = transactionSession(p, await args.req.transactionID).db;
        await db.execute("SAVEPOINT transfer_readonly");
        await assert.rejects(
          () => db.execute("UPDATE crm_clients SET revision=revision"),
          (e: unknown) => {
            const x = e as { code?: string; cause?: { code?: string } };
            return x.code === "25006" || x.cause?.code === "25006";
          },
        );
        await db.execute("ROLLBACK TO SAVEPOINT transfer_readonly");
      }
    }
    return Reflect.apply(find, p, [args]);
  } as typeof p.find;
  let isolationReceipt: TransferReceipt;
  try {
    isolationReceipt = await commitTransfer(faultInput);
    testingReadOnly = true;
    await preview();
    await read(manager, { action: "assignmentHistory", clientID: faultClient });
  } finally {
    p.db.beginTransaction = begin;
    p.find = find;
  }
  assert.ok(readCommitted);
  assert.equal(isolationReceipt!.inquiryIDs.length, 2);
  const commit = p.db.commitTransaction;
  const uncertain = await proposal([fq1.id, fq2.id], true, third.id, faultClient);
  let lost = false;
  p.db.commitTransaction = async (id) => {
    await commit.call(p.db, id);
    if (!lost) {
      lost = true;
      throw Error("Transfer committed response lost");
    }
  };
  try {
    await assert.rejects(
      () => crmAction(p, actor(manager), uncertain),
      /Transfer committed response lost/,
    );
  } finally {
    p.db.commitTransaction = commit;
  }
  const committed = await fingerprints();
  const recovered = await crmAction(p, actor(manager), uncertain);
  assert.ok(recovered.transferID);
  assert.deepEqual(await fingerprints(), committed);
  assert.equal(
    (
      await pool.query("SELECT count(*) FROM crm_operations WHERE operation_key=$1", [
        uncertain.operationKey,
      ])
    ).rows[0].count,
    "1",
  );
  pass(
    "B2 explicitly overrides RR to RC; actual committed response loss recovers original receipt without duplicate side effects",
  );
  console.log(`CRM assignment integration: ${checks} groups passed`);
} finally {
  await p.destroy();
}
process.exit(0);
