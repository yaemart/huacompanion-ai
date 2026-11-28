import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { once } from "node:events";
import { resolve } from "node:path";
import { createServer } from "node:net";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { transactionSession } from "../../src/server/db-types";
import { crmAction } from "../../src/server/crm/service";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const preview = process.argv.includes("--preview"),
  base = "http://127.0.0.1:3201";
if (preview && process.env.GITHUB_ACTIONS === "true") throw Error("No CI preview");
const probe = createServer();
await new Promise<void>((r, reject) => {
  probe.once("error", reject);
  probe.listen(3201, "127.0.0.1", r);
});
await new Promise<void>((r) => probe.close(() => r()));
const { getPayload } = await import("payload");
const p = await getPayload({ config: (await import("../../src/payload.config")).default });
const pool = (p.db as unknown as PostgresAdapter).pool;
mkdirSync(".local/crm-a2", { recursive: true });
const log = createWriteStream(".local/crm-a2/next-http.log", { flags: "w", mode: 0o600 });
let child: ReturnType<typeof spawn> | undefined;
try {
  const email = preview ? "crm-preview@example.invalid" : `${randomUUID()}@example.invalid`;
  const password = preview ? "Fictional-preview-only!2026" : randomUUID();
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "CRM HTTP admin",
      email,
      password,
      role: "admin",
      active: true,
    },
  });
  const user = { ...admin, collection: "staff" as const },
    req = { user };
  const team = await p.create({ collection: "teams", data: { name: "CRM virtual team" } });
  const operator = await p.create({
    collection: "staff",
    req: { ...req },
    data: {
      name: "Virtual operator",
      email: `${randomUUID()}@example.invalid`,
      password,
      role: "operations",
      team: team.id,
    },
  });
  const editor = await p.create({
    collection: "staff",
    req: { ...req },
    data: {
      name: "Virtual editor",
      email: `${randomUUID()}@example.invalid`,
      password,
      role: "editor",
    },
  });
  const manager = await p.create({
    collection: "staff",
    req: { ...req },
    data: {
      name: "Virtual manager",
      email: `${randomUUID()}@example.invalid`,
      password,
      role: "manager",
      team: team.id,
    },
  });
  const client = await crmAction(p, user, {
    action: "createClient",
    operationKey: randomUUID(),
    kind: "company",
    displayName: "虚构客户 · 手机与键盘测试",
    language: "en",
    teamID: team.id,
    ownerID: operator.id,
  });
  const inquiry = await p.create({
    collection: "inquiries",
    req: { ...req },
    data: {
      reference: "CRM-HTTP-CANDIDATE",
      requestKey: randomUUID(),
      contentHash: randomUUID(),
      name: "虚构待关联咨询",
      email: "candidate@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      team: team.id,
      owner: operator.id,
    },
  });
  const legacyQ = await p.create({
    collection: "inquiries",
    req: { ...req },
    data: {
      reference: "CRM-HTTP-LEGACY",
      requestKey: randomUUID(),
      contentHash: randomUUID(),
      name: "虚构已有客户授权咨询",
      email: "legacy@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      team: team.id,
      owner: operator.id,
    },
  });
  await crmAction(p, user, {
    action: "linkInquiry",
    operationKey: randomUUID(),
    clientID: client.clientID,
    inquiryID: legacyQ.id,
    expectedClientRevision: 1,
    expectedLinkRevision: 0,
    reason: "Virtual independent business evidence",
  });
  const account = await p.create({
    collection: "customer-accounts",
    data: {
      email: "legacy-http@example.invalid",
      active: true,
      verifiedAt: new Date().toISOString(),
    },
  });
  await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: account.id,
      inquiry: legacyQ.id,
      active: true,
      dedupe: `${account.id}:${legacyQ.id}`,
      verifiedBy: admin.id,
      verifiedAt: new Date().toISOString(),
      verificationReason: "Virtual independent identity evidence",
    },
  });
  child = spawn(
    process.execPath,
    [
      "--import",
      resolve("tests/helpers/crm-response-loss.mjs"),
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3201",
    ],
    {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  const deadline = Date.now() + 90000;
  while (true) {
    if (child.exitCode !== null) throw Error("Next fixture exited early; see private log");
    const ready = await fetch(base + "/api/crm?action=list").catch(() => undefined);
    if (ready?.status === 401) break;
    assert.ok(Date.now() < deadline, "Next HTTP fixture ready");
    await new Promise((r) => setTimeout(r, 250));
  }
  if (preview) {
    writeFileSync(
      ".local/crm-a2/preview.json",
      JSON.stringify({ base, pid: process.pid, clientID: client.clientID, inquiryID: inquiry.id }),
      { mode: 0o600 },
    );
    console.log("CRM virtual browser fixture ready on loopback 3201");
    await new Promise<void>((r) => {
      process.once("SIGTERM", r);
      process.once("SIGINT", r);
    });
  } else {
    const login = async (who: string) => {
      const r = await fetch(base + "/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: base },
        body: JSON.stringify({ email: who, password }),
      });
      assert.equal(r.status, 200);
      const d = await r.json();
      assert.equal(typeof d.token, "string");
      return { authorization: `JWT ${d.token}` };
    };
    const adminHeaders = await login(email),
      opHeaders = await login(operator.email),
      editorHeaders = await login(editor.email),
      managerHeaders = await login(manager.email);
    const get = (query: string, h: Record<string, string> = {}) =>
      fetch(base + "/api/crm?" + query, { headers: h });
    const post = (body: unknown, h = adminHeaders, origin = base) =>
      fetch(base + "/api/crm", {
        method: "POST",
        headers: { ...h, origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const before = await databaseFingerprints(pool);
    assert.equal((await get("action=list")).status, 401);
    assert.equal((await get("action=list", editorHeaders)).status, 403);
    assert.equal(
      (await get("action=list", { cookie: "hua-customer=" + "a".repeat(64) })).status,
      401,
    );
    assert.equal((await get("action=get&clientID=01", adminHeaders)).status, 400);
    assert.equal((await get("action=get&clientID=1&clientID=2", adminHeaders)).status, 400);
    assert.equal((await get("action=overviewList")).status, 401);
    assert.equal((await get("action=overviewList", editorHeaders)).status, 403);
    const ov = await get("action=overviewList", opHeaders);
    assert.equal(ov.status, 200);
    assert.equal(ov.headers.get("cache-control"), "no-store");
    assert.match(ov.headers.get("vary") ?? "", /Authorization/);
    assert.equal(ov.headers.get("x-content-type-options"), "nosniff");
    const ovData = await ov.json();
    assert.equal(ovData.timeZone, "Asia/Shanghai");
    assert.ok(ovData.items.some((c: { id: number }) => c.id === client.clientID));
    assert.equal(JSON.stringify(ovData).includes("@example.invalid"), false);
    assert.equal(
      (await get(`action=overview&clientID=${client.clientID}`, managerHeaders)).status,
      200,
    );
    assert.equal((await get(`action=overview&clientID=999999999`, opHeaders)).status, 404);
    assert.equal((await get("action=assignmentQueue&target=client", opHeaders)).status, 403);
    assert.equal((await get("action=assignmentQueue&target=client", managerHeaders)).status, 200);
    for (const query of [
      "action=overviewList&limit=51",
      "action=overviewList&kind=all",
      "action=overviewList&page=01",
      "action=overviewList&page=1&page=2",
      "action=overview&clientID=1&owner=mine",
    ])
      assert.equal((await get(query, adminHeaders)).status, 400);
    assert.equal((await get(`action=overviewList&teamID=${team.id}`, opHeaders)).status, 403);
    const options = await get("action=options", opHeaders);
    assert.equal(options.status, 200);
    const opts = await options.json();
    assert.equal(opts.role, "operations");
    assert.deepEqual(opts.owners, []);
    assert.ok(!JSON.stringify(opts).includes("@example.invalid"));
    const read = await get(`action=get&clientID=${client.clientID}`, adminHeaders);
    assert.equal(read.headers.get("cache-control"), "no-store");
    assert.match(read.headers.get("vary") ?? "", /Cookie/);
    assert.equal(read.headers.get("x-content-type-options"), "nosniff");
    const html = await fetch(base + "/crm-center", { headers: adminHeaders });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /客户档案/);
    const anonymous = await fetch(base + "/crm-center", { redirect: "manual" });
    assert.equal(anonymous.status, 307);
    assert.match(anonymous.headers.get("location") ?? "", /admin\/login/);
    const body = {
      action: "createClient",
      operationKey: randomUUID(),
      kind: "individual",
      displayName: "HTTP customer",
      language: "zh",
      teamID: team.id,
    };
    assert.equal((await post(body, adminHeaders, "https://example.invalid")).status, 403);
    assert.equal((await post({ ...body, actor: admin.id })).status, 400);
    const huge = await fetch(base + "/api/crm", {
      method: "POST",
      headers: { ...adminHeaders, origin: base },
      body: "x".repeat(16385),
    });
    assert.equal(huge.status, 413);
    assert.deepEqual(await databaseFingerprints(pool), before);
    const lock = await p.db.beginTransaction();
    assert.ok(lock);
    await transactionSession(p, lock).db.execute("SELECT pg_advisory_xact_lock(726281)");
    const waitingRead = get("action=overviewList", opHeaders);
    const waitUntil = Date.now() + 10000;
    while (
      !(
        await pool.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
        )
      ).rowCount
    ) {
      assert.ok(Date.now() < waitUntil, "HTTP request waits for actual business lock");
      await new Promise((r) => setTimeout(r, 10));
    }
    await p.update({
      collection: "staff",
      id: operator.id,
      data: { sessions: [] },
      req: { user, transactionID: lock },
    });
    await p.db.commitTransaction(lock);
    const afterRevoke = await databaseFingerprints(pool);
    assert.equal(
      (await waitingRead).status,
      401,
      "HTTP waiting overview must recheck native session",
    );
    assert.deepEqual(await databaseFingerprints(pool), afterRevoke);
    Object.assign(opHeaders, await login(operator.email));
    console.log("PASS CRM overview HTTP lock wait: native session revoked,401 and zero writes");

    const saved = await post(body);
    assert.equal(saved.status, 200);
    const receipt = await saved.json();
    assert.deepEqual(await (await post(body)).json(), receipt);
    writeFileSync(".local/crm-a2/drop-next-response", "fixture", { mode: 0o600 });
    const uncertain = { ...body, operationKey: randomUUID(), displayName: "HTTP lost response" };
    await assert.rejects(async () => {
      const response = await post(uncertain);
      await response.json();
    });
    assert.equal(existsSync(".local/crm-a2/drop-next-response"), false);
    assert.equal((await post(uncertain)).status, 200);
    assert.equal(
      (
        await pool.query("SELECT count(*) FROM crm_operations WHERE operation_key=$1", [
          uncertain.operationKey,
        ])
      ).rows[0].count,
      "1",
    );
    const mutate = async (data: Record<string, unknown>) => {
      const r = await post({ ...data, operationKey: randomUUID() });
      assert.equal(r.status, 200);
      return r.json();
    };
    const contact = await mutate({
      action: "saveContact",
      clientID: client.clientID,
      expectedClientRevision: 2,
      name: "HTTP contact",
      email: "HTTP-CONTACT@example.invalid",
    });
    const primary = await mutate({
      action: "setPrimaryContact",
      clientID: client.clientID,
      expectedClientRevision: contact.clientRevision,
      contactID: contact.contactID,
    });
    const linked = await mutate({
      action: "linkInquiry",
      clientID: client.clientID,
      inquiryID: inquiry.id,
      expectedClientRevision: primary.clientRevision,
      expectedLinkRevision: 0,
      reason: "HTTP explicit business evidence",
    });
    const revoked = await mutate({
      action: "revokeInquiryLink",
      clientID: client.clientID,
      linkID: linked.linkID,
      expectedClientRevision: linked.clientRevision,
      expectedRevision: linked.revision,
      reason: "HTTP correction of internal association",
    });
    const legacy = (
      await p.find({
        collection: "crm-inquiry-links",
        where: { inquiry: { equals: legacyQ.id } },
        limit: 1,
      })
    ).docs[0];
    const protectedBefore = await databaseFingerprints(pool);
    const deniedRevoke = await post({
      action: "revokeInquiryLink",
      operationKey: randomUUID(),
      clientID: client.clientID,
      linkID: legacy.id,
      expectedClientRevision: revoked.clientRevision,
      expectedRevision: legacy.revision,
      reason: "HTTP must preserve independent authorization",
    });
    assert.equal(deniedRevoke.status, 409);
    assert.deepEqual(await databaseFingerprints(pool), protectedBefore);
    assert.equal((await get(`action=get&clientID=${receipt.clientID}`, opHeaders)).status, 404);

    const b2Client = await mutate({
      action: "createClient",
      kind: "company",
      displayName: "HTTP B2 fictional",
      language: "en",
      teamID: team.id,
      ownerID: operator.id,
    });
    const b2Inquiry = await p.create({
      collection: "inquiries",
      req: { user },
      data: {
        reference: "HTTP-B2-" + randomUUID(),
        requestKey: randomUUID(),
        contentHash: randomUUID(),
        name: "HTTP fictional B2 inquiry",
        email: "b2-private@example.invalid",
        categories: ["business"],
        city: "Shanghai",
        status: "new",
        team: team.id,
        owner: operator.id,
      },
    });
    await mutate({
      action: "linkInquiry",
      clientID: b2Client.clientID,
      inquiryID: b2Inquiry.id,
      expectedClientRevision: 1,
      expectedLinkRevision: 0,
      reason: "HTTP reviewed B2 association",
    });
    const b2Recipient = await p.create({
      collection: "staff",
      req: { user },
      data: {
        name: "HTTP B2 recipient",
        email: randomUUID() + "@example.invalid",
        password,
        role: "operations",
        team: team.id,
        active: true,
      },
    });
    await p.create({
      collection: "customer-inquiry-links",
      data: {
        customer: account.id,
        inquiry: b2Inquiry.id,
        active: true,
        dedupe: `${account.id}:${b2Inquiry.id}`,
        verifiedBy: admin.id,
        verifiedAt: new Date().toISOString(),
        verificationReason: "Independent B2 HTTP authorization",
      },
    });
    const b2Preview = async () => {
      const r = await get(`action=transferPreview&clientID=${b2Client.clientID}`, managerHeaders);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "no-store");
      return r.json();
    };
    const b2Body = async (recipientID: number, includeInquiry = true) => {
      const preview = await b2Preview();
      const selected = preview.inquiries.find(
        (q: { inquiryID: number }) => q.inquiryID === b2Inquiry.id,
      );
      return {
        action: "transferAssignments",
        operationKey: randomUUID(),
        clientID: b2Client.clientID,
        expectedClientRevision: preview.expectedClientRevision,
        recipientID,
        transferClient: true,
        reason: "HTTP explicit reviewed responsibility transfer",
        inquiries: includeInquiry
          ? [
              {
                inquiryID: selected.inquiryID,
                expectedUpdatedAt: selected.expectedUpdatedAt,
                expectedOwnerID: selected.expectedOwnerID,
                expectedCaseRevision: selected.expectedCaseRevision,
              },
            ]
          : [],
      };
    };
    const b2First = await b2Body(b2Recipient.id);
    assert.equal(
      (await get(`action=transferPreview&clientID=${b2Client.clientID}`, opHeaders)).status,
      403,
    );
    assert.equal((await post(b2First, opHeaders)).status, 403);
    assert.equal((await post({ ...b2First, force: true }, managerHeaders)).status, 400);
    const externalFingerprint = async () =>
      (await databaseFingerprints(pool)).filter((t) => t.table.startsWith("customer_"));
    const b2Protected = await externalFingerprint();
    const b2Saved = await post(b2First, managerHeaders);
    assert.equal(b2Saved.status, 200);
    const b2Receipt = await b2Saved.json();
    assert.ok(b2Receipt.transferID > 0);
    assert.deepEqual(b2Receipt.inquiryIDs, [b2Inquiry.id]);
    assert.deepEqual(await (await post(b2First, managerHeaders)).json(), b2Receipt);
    assert.equal((await get(`action=get&clientID=${b2Client.clientID}`, opHeaders)).status, 404);
    const b2History = await get(
      `action=assignmentHistory&clientID=${b2Client.clientID}`,
      managerHeaders,
    );
    assert.equal(b2History.status, 200);
    assert.equal((await b2History.json()).total, 1);
    const staleTransfer = { ...b2First, operationKey: randomUUID() };
    assert.equal((await post(staleTransfer, managerHeaders)).status, 409);
    const b2Unknown = await b2Body(operator.id);
    writeFileSync(".local/crm-a2/drop-next-response", "B2 fixture", { mode: 0o600 });
    await assert.rejects(async () => {
      const r = await post(b2Unknown, managerHeaders);
      await r.json();
    });
    const b2Recovered = await post(b2Unknown, managerHeaders);
    assert.equal(b2Recovered.status, 200);
    assert.equal(
      (
        await pool.query("SELECT count(*) FROM crm_operations WHERE operation_key=$1", [
          b2Unknown.operationKey,
        ])
      ).rows[0].count,
      "1",
    );
    assert.deepEqual(await externalFingerprint(), b2Protected);
    const waitingTransfer = await b2Body(b2Recipient.id, false);
    const b2Lock = await p.db.beginTransaction();
    assert.ok(b2Lock);
    await transactionSession(p, b2Lock).db.execute("SELECT pg_advisory_xact_lock(726281)");
    const b2Waiting = post(waitingTransfer, managerHeaders);
    const b2Until = Date.now() + 10000;
    while (
      !(
        await pool.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
        )
      ).rowCount
    ) {
      assert.ok(Date.now() < b2Until);
      await new Promise((r) => setTimeout(r, 10));
    }
    await p.update({
      collection: "staff",
      id: manager.id,
      data: { sessions: [] },
      req: { user, transactionID: b2Lock },
    });
    await p.db.commitTransaction(b2Lock);
    const b2AfterRevocation = await databaseFingerprints(pool);
    assert.equal((await b2Waiting).status, 401);
    assert.deepEqual(await databaseFingerprints(pool), b2AfterRevocation);
    Object.assign(managerHeaders, await login(manager.email));
    assert.equal((await post(waitingTransfer, managerHeaders)).status, 200);
    assert.deepEqual(await externalFingerprint(), b2Protected);
    console.log(
      "PASS CRM B2 actual HTTP: manager transfer/preview/history,403 roles,409 versions, original-key response recovery, " +
        "native session revoked while waiting401/zero writes and unchanged external grants",
    );
    const logout = await fetch(base + "/api/staff/logout", {
      method: "POST",
      headers: { ...adminHeaders, origin: base },
    });
    assert.equal(logout.status, 200);
    assert.equal((await get("action=list", adminHeaders)).status, 401);
    assert.equal((await get("action=overviewList", adminHeaders)).status, 401);
    console.log(
      "PASS CRM actual Next HTTP: native login/logout, roles, SSR, strict parameters/origin/16KiB, no-store, zero-write reads and committed response loss",
    );
  }
} finally {
  if (child && child.exitCode === null) {
    const closed = once(child, "exit");
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child?.kill("SIGKILL"), 15000);
    await closed;
    clearTimeout(timeout);
  }
  log.end();
  await p.destroy();
}
process.exit(0);
