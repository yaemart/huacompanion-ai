import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Staff } from "../../payload-types";
import type {
  ClientRow,
  OverviewDetail,
  OverviewPage,
  QueueItem,
} from "../../src/lib/crm-overview";
import { overviewDay } from "../../src/lib/crm-overview";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { crmAction } from "../../src/server/crm/service";
import { crmRead } from "../../src/server/crm/read";
import { transactionSession } from "../../src/server/db-types";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const mod = await import("../../src/server/crm/overview");
assert.ok("crmOverview" in mod);
const { getPayload } = await import("payload");
const p = await getPayload({ config: (await import("../../src/payload.config")).default });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
const actor = (s: Staff) => ({ ...s, collection: "staff" as const });
let checks = 0;
const pass = (s: string) => console.log(`PASS CRM overview ${++checks}: ${s}`);
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Overview admin",
      email: key() + "@example.invalid",
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const root = actor(admin);
  const team = await p.create({ collection: "teams", data: { name: "Overview team" } });
  const ft = await p.create({ collection: "teams", data: { name: "Other overview team" } });
  const staff = (role: "operations" | "manager" | "editor", t: number | null = team.id) =>
    p.create({
      collection: "staff",
      req: { user: root },
      data: {
        name: "Overview " + role,
        email: key() + "@example.invalid",
        password: key(),
        role,
        team: t,
        active: true,
      },
    });
  const op = await staff("operations"),
    other = await staff("operations"),
    manager = await staff("manager"),
    foreign = await staff("operations", ft.id),
    editor = await staff("editor"),
    noTeam = await staff("manager", null);
  const dual = await p.update({
    collection: "staff",
    id: editor.id,
    req: { user: root },
    data: { additionalRoles: ["operations"] },
  });
  const makeClient = async (name: string, ownerID: number | null = op.id, teamID = team.id) =>
    (
      await crmAction(p, root, {
        action: "createClient",
        operationKey: key(),
        kind: "company",
        displayName: name,
        language: "en",
        ownerID,
        teamID,
      })
    ).clientID;
  const a = await makeClient("B1 public"),
    b = await makeClient("B1 other", other.id),
    f = await makeClient("B1 foreign", foreign.id, ft.id);
  await makeClient("B1 dual", dual.id);
  const unassigned = await makeClient("B1 unassigned", null);
  const inquiry = (owner = op.id, t = team.id) =>
    p.create({
      collection: "inquiries",
      req: { user: root },
      data: {
        reference: "OV-" + key(),
        requestKey: key(),
        contentHash: key(),
        name: "Fictional overview visitor",
        email: "private-canary@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        team: t,
        owner,
        status: "new",
        notes: "PRIVATE-CANARY",
      },
    });
  const q = await inquiry(),
    hidden = await inquiry(other.id),
    closed = await inquiry();
  const link = async (clientID: number, inquiryID: number) => {
    const c = await crmRead(p, root, { action: "get", clientID });
    assert.ok("revision" in c);
    await crmAction(p, root, {
      action: "linkInquiry",
      clientID,
      inquiryID,
      expectedClientRevision: c.revision,
      expectedLinkRevision: 0,
      reason: "Fictional reviewed CRM association",
      operationKey: key(),
    });
  };
  await link(a, q.id);
  await link(a, hidden.id);
  await link(a, closed.id);
  await pool.query("UPDATE inquiries SET status='closed' WHERE id=$1", [closed.id]);
  const service = await p.create({
    collection: "service-cases",
    data: {
      inquiry: q.id,
      title: "Visible case",
      stage: "paused",
      revision: 1,
      internalArrangement: "PRIVATE-CANARY",
    },
  });
  const hiddenCase = await p.create({
    collection: "service-cases",
    data: { inquiry: hidden.id, title: "HIDDEN-CANARY", stage: "in-service", revision: 1 },
  });
  const read = (user: Staff, input: Record<string, unknown>) =>
    mod.crmOverview(p, actor(user), input);
  const list = (user: Staff, extra: Record<string, unknown> = {}) =>
    read(user, { action: "overviewList", ...extra }) as Promise<OverviewPage<ClientRow>>;
  const detail = (user: Staff, id = a, extra: Record<string, unknown> = {}) =>
    read(user, { action: "overview", clientID: id, ...extra }) as Promise<OverviewDetail>;
  const queue = (target: "client" | "inquiry", user = manager) =>
    read(user, { action: "assignmentQueue", target }) as Promise<OverviewPage<QueueItem>>;
  const reject = async (fn: () => Promise<unknown>, status: number) => {
    const before = await databaseFingerprints(pool);
    await assert.rejects(fn, { status });
    assert.deepEqual(await databaseFingerprints(pool), before);
  };
  const before = await databaseFingerprints(pool);
  const ours = await list(op);
  assert.deepEqual(
    ours.items.map((c) => c.id),
    [a],
  );
  assert.equal(ours.items[0].visibleInquiryCount, 1);
  assert.equal(ours.items[0].visibleCaseCount, 1);

  assert.deepEqual(await databaseFingerprints(pool), before);
  for (const user of [root, actor(manager), actor(op), actor(dual), actor(foreign)]) {
    const expected = await crmRead(p, user, { action: "list", limit: 50 });
    assert.ok("items" in expected);
    assert.deepEqual(
      (await list(user as Staff, { limit: 50 })).items.map((c) => c.id),
      expected.items?.map((c) => (c as ClientRow).id),
    );
  }
  const plainEditor = await staff("editor");
  await reject(() => list(plainEditor), 403);
  await reject(() => list(noTeam), 404);
  await reject(() => list(op, { teamID: team.id }), 403);
  await reject(() => queue("client", op), 403);
  await reject(() => list(op, { owner: "unassigned" }), 403);
  pass("SQL scope agrees with Payload and read fingerprints unchanged");
  const withoutClock = (value: unknown) =>
    JSON.parse(JSON.stringify(value, (k, v) => (k === "asOf" ? undefined : v)));
  const visibleBefore = withoutClock(await list(op));
  await pool.query(
    "UPDATE inquiries SET next_follow_up='infinity',updated_at='2090-01-01',name='HIDDEN-CANARY' WHERE id=$1",
    [hidden.id],
  );
  await pool.query(
    "UPDATE service_cases SET updated_at='2090-01-01',title='HIDDEN-CANARY' WHERE id=$1",
    [hiddenCase.id],
  );
  assert.deepEqual(withoutClock(await list(op)), visibleBefore);
  await reject(() => list(manager), 503);
  await pool.query("UPDATE inquiries SET next_follow_up=NULL,updated_at=now() WHERE id=$1", [
    hidden.id,
  ]);
  await pool.query("UPDATE service_cases SET updated_at=now() WHERE id=$1", [hiddenCase.id]);
  pass("hidden changes do not affect aggregates, dates, filters or visible update ordering");
  const now = new Date(),
    day = overviewDay(now.toISOString());
  const due = new Date(Date.parse(day.start) + 1).toISOString();
  await pool.query("UPDATE inquiries SET next_follow_up=$1 WHERE id=$2", [due, q.id]);
  assert.equal((await list(op, { work: "dueToday" })).total, 1);
  assert.equal((await list(op, { work: "overdue" })).total, 1);
  assert.equal((await list(op, { work: "active" })).total, 1);
  assert.equal((await list(op, { kind: "individual" })).total, 0);
  assert.equal((await list(op, { owner: "mine" })).total, 1);
  assert.equal((await list(admin, { teamID: ft.id })).total, 1);
  assert.equal((await list(op, { q: "%' OR 1=1 --" })).total, 0);
  pass("Beijing due today and overdue overlap; filters intersect without SQL/wildcard injection");
  assert.deepEqual(
    (await queue("client")).items.map((i) => i.clientID),
    [unassigned],
  );
  await p.update({
    collection: "staff",
    id: other.id,
    req: { user: root },
    data: { active: false },
  });
  assert.ok(
    (await queue("client")).items.some(
      (i) => i.clientID === b && i.ownerDisplay.state === "inactive",
    ),
  );
  assert.ok((await queue("inquiry")).items.some((i) => i.inquiryID === hidden.id));
  await p.update({
    collection: "staff",
    id: other.id,
    req: { user: root },
    data: { active: true, team: ft.id },
  });
  assert.ok(
    (await queue("client")).items.some(
      (i) => i.clientID === b && i.ownerDisplay.state === "ineligible",
    ),
  );
  await p.update({
    collection: "staff",
    id: other.id,
    req: { user: root },
    data: { team: team.id, role: "editor" },
  });
  assert.ok(
    (await queue("client")).items.some(
      (i) => i.clientID === b && i.ownerDisplay.state === "ineligible",
    ),
  );
  await p.update({
    collection: "staff",
    id: other.id,
    req: { user: root },
    data: { role: "operations" },
  });
  assert.deepEqual(
    (await queue("client")).items.map((i) => i.clientID),
    [unassigned],
  );
  await pool.query("UPDATE inquiries SET owner_id=NULL WHERE id=$1", [q.id]);
  assert.ok((await queue("inquiry")).items.some((i) => i.inquiryID === q.id));
  await pool.query("UPDATE inquiries SET owner_id=$1 WHERE id=$2", [op.id, q.id]);
  assert.equal((await queue("inquiry")).total, 0);
  await inquiry(); // unlinked inquiry is deliberately outside the CRM queue
  pass(
    "queue dynamically detects inactive, moved, role-removed and missing owners without mutation",
  );
  await pool.query(
    `INSERT INTO crm_clients(reference,kind,display_name,language,team_id,owner_id,status,revision)
    SELECT 'B1-PAGE-'||g,'company','B1 bulk page','en',$1,$2,'active',1 FROM generate_series(1,201) g`,
    [team.id, op.id],
  );
  const bulk = await list(op, { q: "B1 bulk page", limit: 50, page: 5 });
  assert.equal(bulk.total, 201);
  assert.equal(bulk.items.length, 1);
  assert.equal((await list(op, { q: "B1 bulk page", page: 999 })).items.length, 0);
  assert.equal((await list(op, { q: "B1 bulk page", page: 999 })).total, 201);
  await pool.query(
    `INSERT INTO inquiries(reference,request_key,content_hash,name,email,city,status,team_id,owner_id)
    SELECT 'B1-BULK-'||g,'b1-request-'||g,'b1-hash-'||g,'Fictional bulk','b1@example.invalid','Shanghai','new',$1,$2
    FROM generate_series(1,201) g`,
    [team.id, op.id],
  );
  await pool.query(
    `INSERT INTO crm_inquiry_links(client_id,inquiry_id,active,revision,linked_by_id,linked_at,reason)
    SELECT $1,id,true,1,$2,now(),'Fictional bulk reviewed link' FROM inquiries WHERE reference LIKE 'B1-BULK-%'`,
    [a, admin.id],
  );
  pass("scope-filtered pagination remains correct beyond 200 and on empty deep pages");
  // Task2 intentionally starts with a failing detail implementation.
  const view = await detail(op, a, { page: 5, limit: 50 });
  assert.equal(view.inquiries.total, 203);
  assert.equal(view.inquiries.items.length, 3);
  await reject(() => detail(other), 404);
  await reject(() => detail(op, f), 404);
  assert.equal(JSON.stringify(view).includes("PRIVATE-CANARY"), false);
  assert.equal(JSON.stringify(view).includes("HIDDEN-CANARY"), false);
  assert.ok(view.recentUpdates.length <= 20);
  assert.deepEqual((await detail(op, a, { page: 1 })).recentUpdates, view.recentUpdates);
  assert.deepEqual(
    Object.keys(view.client).sort(),
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
      "ownerState",
      "ownerDisplay",
      "visibleInquiryCount",
      "visibleCaseCount",
      "nextFollowUp",
      "lastVisibleUpdate",
    ].sort(),
  );
  pass("detail is independently paginated, exact safe DTO and stable recent updates");
  const result = await crmAction(p, root, {
    action: "saveContact",
    clientID: a,
    expectedClientRevision: (await detail(admin)).client.revision,
    operationKey: key(),
    name: "Primary fictional",
    email: "primary@example.invalid",
  });
  await crmAction(p, root, {
    action: "setPrimaryContact",
    clientID: a,
    expectedClientRevision: result.clientRevision,
    contactID: result.contactID,
    operationKey: key(),
  });
  assert.equal((await detail(op)).primaryContact?.name, "Primary fictional");
  const quote = await p.create({
    collection: "service-quotes",
    data: {
      serviceCase: hiddenCase.id,
      dedupe: key(),
      revision: 1,
      status: "draft",
      title: "HIDDEN-QUOTE",
      scope: "Private scope",
      included: "Private included",
      excluded: "Private excluded",
      terms: "Private terms",
      currency: "CNY",
      lines: [],
      totalMinor: 9999,
      internalCostMinor: 7777,
      expiresAt: "2090-01-01T00:00:00.000Z",
      createdBy: admin.id,
    },
  });
  await pool.query("UPDATE service_cases SET latest_quote_id=$1 WHERE id=$2", [
    quote.id,
    service.id,
  ]);
  await reject(() => detail(op, a, { page: 5, limit: 50 }), 503);
  await pool.query("UPDATE service_quotes SET service_case_id=$1 WHERE id=$2", [
    service.id,
    quote.id,
  ]);
  const quoted = (await detail(op, a, { page: 5, limit: 50 })).inquiries.items.find(
    (i) => i.id === q.id,
  )!;
  assert.deepEqual(quoted.serviceCase?.latestQuote, { id: quote.id, revision: 1, status: "draft" });
  assert.deepEqual(
    Object.keys(quoted.serviceCase!).sort(),
    ["id", "title", "stage", "revision", "latestQuote"].sort(),
  );
  assert.equal(JSON.stringify(quoted).includes("7777"), false);
  await pool.query("UPDATE inquiries SET next_follow_up='infinity' WHERE id=$1", [q.id]);
  await reject(() => detail(op), 503);
  await pool.query("UPDATE inquiries SET next_follow_up=NULL WHERE id=$1", [q.id]);
  await pool.query("DROP INDEX crm_contacts_primary_idx");
  const duplicate = await pool.query(
    "INSERT INTO crm_contacts(client_id,name,email,is_primary,status,revision) VALUES($1,'Duplicate','duplicate@example.invalid',true,'active',1) RETURNING id",
    [a],
  );
  await reject(() => detail(op), 503);
  await pool.query("DELETE FROM crm_contacts WHERE id=$1", [duplicate.rows[0].id]);
  await pool.query(
    "CREATE UNIQUE INDEX crm_contacts_primary_idx ON crm_contacts(client_id) WHERE is_primary AND status='active'",
  );
  const closedCase = await p.create({
    collection: "service-cases",
    data: {
      inquiry: closed.id,
      title: "Inconsistent legacy status",
      stage: "aftercare",
      revision: 1,
    },
  });
  assert.ok(
    (await detail(op, a, { page: 5, limit: 50 })).inquiries.items.find((i) => i.id === closed.id)
      ?.needsReview,
  );
  assert.ok(closedCase.id);
  pass(
    "wrong-parent quote, invalid date, duplicate primary fail closed; closed inquiry with unfinished case is flagged",
  );
  const originalFind = p.find;
  let ro = false;
  p.find = async function (args) {
    if (args.collection === "staff" && args.req?.transactionID) {
      const db = transactionSession(p, await args.req.transactionID).db;
      await db.execute("SAVEPOINT overview_read_only");
      await assert.rejects(
        () => db.execute("UPDATE crm_clients SET revision=revision"),
        (e: unknown) => {
          const err = e as { code?: string; cause?: { code?: string } };
          return err.code === "25006" || err.cause?.code === "25006";
        },
      );
      await db.execute("ROLLBACK TO SAVEPOINT overview_read_only");
      ro = true;
    }
    return Reflect.apply(originalFind, p, [args]);
  } as typeof p.find;
  const readBefore = await databaseFingerprints(pool);
  try {
    await list(op);
    await detail(op);
    await queue("client");
  } finally {
    p.find = originalFind;
  }
  assert.ok(ro);
  assert.deepEqual(await databaseFingerprints(pool), readBefore);
  pass("real READ ONLY transaction rejects writes 25006; every table fingerprint stays unchanged");
  await pool.query(
    `INSERT INTO inquiries(reference,request_key,content_hash,name,email,city,status,team_id,owner_id)
    SELECT 'B1-FOREIGN-'||g,'b1-foreign-request-'||g,'b1-foreign-hash-'||g,'Fictional foreign bulk','foreign@example.invalid',
    'Shanghai','new',$1,$2 FROM generate_series(1,20000) g`,
    [ft.id, foreign.id],
  );
  await pool.query("ANALYZE inquiries");
  const indexes = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE tablename IN ('inquiries','crm_clients') ORDER BY indexname",
  );
  assert.ok(indexes.rows.some((r) => r.indexname === "crm_clients_scope_idx"));
  const explain = await pool.query(
    "EXPLAIN SELECT id FROM inquiries WHERE team_id=$1 AND owner_id=$2 AND status <> 'closed'",
    [team.id, op.id],
  );
  console.log(
    "CRM overview existing-index EXPLAIN:",
    explain.rows.map((r) => r["QUERY PLAN"]).join(" | "),
  );
  assert.match(JSON.stringify(explain.rows), /inquiries_(team|owner)_idx/);
  pass(
    "existing client scope and inquiry team indexes support selective scoped query; no migration required",
  );
  const password = key(),
    email = key() + "@example.invalid";
  const sessionStaff = await p.create({
    collection: "staff",
    req: { user: root },
    data: {
      name: "Overview waiting session",
      email,
      password,
      role: "operations",
      team: team.id,
      active: true,
    },
  });
  const login = await p.login({ collection: "staff", data: { email, password } });
  const { authenticateCrm } = await import("../../src/server/crm/access");
  const session = await authenticateCrm(p, new Headers({ authorization: `JWT ${login.token}` }));
  const block = await p.db.beginTransaction();
  assert.ok(block);
  await transactionSession(p, block).db.execute("SELECT pg_advisory_xact_lock(726281)");
  const waiting = mod.crmOverview(p, session, { action: "overviewList" });
  const denied = assert.rejects(waiting, { status: 401 });
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
    id: sessionStaff.id,
    data: { active: false },
    req: { user: root, transactionID: block },
  });
  await p.db.commitTransaction(block);
  const afterRevocation = await databaseFingerprints(pool);
  await denied;
  assert.deepEqual(await databaseFingerprints(pool), afterRevocation);
  pass("actual JWT revoked while waiting for business lock is rejected with zero writes");
  console.log(`CRM overview integration: ${checks} groups passed`);
} finally {
  await p.destroy();
}
process.exit(0);
