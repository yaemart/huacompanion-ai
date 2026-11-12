import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Payload } from "payload";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import type { Inquiry } from "../../payload-types";
import { relationID } from "../../src/cms/access";
import { summarize } from "../../src/lib/reporting";
import { changeInquiryStatus } from "../../src/server/inquiry-status";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_inquiry_status_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = `inquiry-status-${randomUUID()}`;
const password = randomUUID();
try {
  const [admin] = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs;
  assert.ok(admin);
  const team = await p.create({ collection: "teams", user: admin, data: { name: key } });
  const foreign = await p.create({
    collection: "teams",
    user: admin,
    data: { name: key + "-other" },
  });
  const staff = (name: string, role: "manager" | "operations" | "reviewer", teamID = team.id) =>
    p.create({
      collection: "staff",
      user: admin,
      data: { name, role, team: teamID, email: `${key}-${name}@example.invalid`, password },
    });
  const operator = await staff("operator", "operations");
  const manager = await staff("manager", "manager");
  const outsider = await staff("outsider", "manager", foreign.id);
  const otherOperator = await staff("other", "operations");
  const reviewer = await staff("reviewer", "reviewer");
  const create = (suffix: string, status: Inquiry["status"] = "processing") =>
    p.create({
      collection: "inquiries",
      user: admin,
      data: {
        name: "虚构客户",
        email: "fictional@example.invalid",
        city: "Shanghai",
        categories: ["business"],
        reference: key + suffix,
        requestKey: randomUUID(),
        contentHash: key,
        team: team.id,
        owner: operator.id,
        status,
        coordinationStage: "contacting",
      },
    });
  const row = await create("-current");
  const read = (id = row.id) => p.findByID({ collection: "inquiries", id, depth: 0 });
  const edit = (data: Partial<Inquiry>, id = row.id) =>
    p.update({ collection: "inquiries", id, user: operator, overrideAccess: false, data });
  const changes = () =>
    p.find({
      collection: "audit-events",
      depth: 0,
      pagination: false,
      where: {
        entity: { equals: "inquiries" },
        recordId: { equals: String(row.id) },
        action: { like: "inquiry-state:" },
      },
    });
  for (const data of [
    { status: "closed" },
    { coordinationStage: "closed" },
    { status: "closed", coordinationStage: "closed" },
  ] as const) {
    await assert.rejects(() => edit(data), { status: 409 });
  }
  const completed = await edit({ coordinationStage: "completed" });
  const openVersion = (
    await p.findVersions({
      collection: "inquiries",
      where: { parent: { equals: row.id } },
      limit: 1,
      sort: "-id",
    })
  ).docs[0];
  assert.equal(openVersion.version.coordinationStage, "completed");
  assert.equal(completed.status, "processing");
  assert.deepEqual(summarize([completed], [], []).funnel, { inquiries: 1, quoted: 0, won: 0 });
  assert.equal(
    summarize([completed], [], [{ inquiry: row.id, confirmedAt: completed.updatedAt }]).funnel.won,
    1,
  );
  const command = async (action: "close" | "reopen", id = row.id) => ({
    id,
    action,
    key: randomUUID(),
    reason: "虚构流程测试原因",
    updatedAt: (await read(id)).updatedAt,
  });
  const close = await command("close");
  await assert.rejects(changeInquiryStatus(p, operator, { ...close, reason: " " }), {
    status: 400,
  });
  for (const actor of [outsider, otherOperator, reviewer]) {
    await assert.rejects(changeInquiryStatus(p, actor, close), { status: 403 });
  }
  assert.equal((await changes()).totalDocs, 0);
  assert.equal((await read()).status, "processing");
  const results = await Promise.all([
    changeInquiryStatus(p, operator, close),
    changeInquiryStatus(p, operator, close),
  ]);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
  const closed = await read();
  assert.equal(closed.status, "closed");
  assert.equal(closed.coordinationStage, "closed");
  const firstAudit = (await changes()).docs[0];
  assert.equal((await changes()).totalDocs, 1);
  await assert.rejects(
    p.restoreVersion({ collection: "inquiries", id: openVersion.id, user: admin }),
    { status: 409 },
  );
  assert.equal(relationID(firstAudit.actor), operator.id);
  assert.ok(Number.isFinite(Date.parse(firstAudit.createdAt)));
  assert.deepEqual(firstAudit.before, { status: "processing", coordinationStage: "completed" });
  assert.deepEqual(firstAudit.after, {
    status: "closed",
    coordinationStage: "closed",
    reason: close.reason,
    operation: "close",
    base: close.updatedAt,
    updatedAt: closed.updatedAt,
  });
  await assert.rejects(changeInquiryStatus(p, operator, { ...close, reason: "不同原因" }), {
    status: 409,
  });
  await assert.rejects(() => edit({ status: "new" }), { status: 409 });
  const reopen = {
    ...(await command("reopen")),
    status: "needs-info",
    coordinationStage: "received",
  };
  for (const invalid of [
    { reason: "" },
    { status: "closed" },
    { status: undefined },
    { coordinationStage: undefined },
  ]) {
    await assert.rejects(changeInquiryStatus(p, manager, { ...reopen, ...invalid }), {
      status: 400,
    });
  }
  const saved = await changeInquiryStatus(p, manager, reopen);
  assert.equal(saved.status, "needs-info");
  assert.equal(saved.coordinationStage, "received");
  assert.equal((await changes()).totalDocs, 2);
  const reopened = (await changes()).docs.find(
    (entry) => entry.action === `inquiry-state:${reopen.key}`,
  )!;
  assert.deepEqual(reopened.before, { status: "closed", coordinationStage: "closed" });
  assert.equal((reopened.after as { reason?: string }).reason, reopen.reason);
  assert.equal(relationID(reopened.actor), manager.id);
  await assert.rejects(changeInquiryStatus(p, operator, close), { status: 409 });
  await assert.rejects(changeInquiryStatus(p, operator, { ...close, key: randomUUID() }), {
    status: 409,
  });

  const legacy = await create("-legacy", "closed");
  await edit(
    { name: "虚构联系人已修正", status: "closed", coordinationStage: "contacting" },
    legacy.id,
  );
  assert.equal((await read(legacy.id)).coordinationStage, "contacting");
  await assert.rejects(() => edit({ coordinationStage: "completed" }, legacy.id), { status: 409 });
  await changeInquiryStatus(p, admin, await command("close", legacy.id));
  assert.equal((await read(legacy.id)).coordinationStage, "closed");

  const queued = await create("-queued");
  const reachedAudit = Promise.withResolvers<void>();
  const releaseAudit = Promise.withResolvers<void>();
  const paused = new Proxy(p, {
    get(target, property, receiver) {
      if (property === "create")
        return async (args: Parameters<Payload["create"]>[0]) => {
          reachedAudit.resolve();
          await releaseAudit.promise;
          return p.create(args);
        };
      return Reflect.get(target, property, receiver);
    },
  });
  const closing = changeInquiryStatus(paused, manager, await command("close", queued.id));
  await Promise.race([reachedAudit.promise, closing]);
  const contactEdit = edit({ name: "虚构并发联系人" }, queued.id);
  const writes = Promise.all([closing, contactEdit]);
  void writes.catch(() => {});
  let waiting = false;
  try {
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const result = await p.db.drizzle.execute(
        "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND objid = 726281 AND NOT granted",
      );
      waiting = result.rows.length > 0;
      if (!waiting) await delay(20);
    }
  } finally {
    releaseAudit.resolve();
    await writes;
  }
  assert.ok(waiting, "contact update must queue behind the close");
  const updated = await read(queued.id);
  assert.equal(updated.name, "虚构并发联系人");
  assert.equal(updated.status, "closed");
  assert.equal(updated.coordinationStage, "closed");

  const broken = new Proxy(p, {
    get(target, property, receiver) {
      if (property === "create")
        return () => Promise.reject(Error("Simulated audit write failure"));
      return Reflect.get(target, property, receiver);
    },
  }) as Payload;
  const nextClose = await command("close");
  await assert.rejects(
    changeInquiryStatus(broken, manager, nextClose),
    /Simulated audit write failure/,
  );
  assert.equal((await read()).status, "needs-info");
  assert.equal((await read()).coordinationStage, "received");
  assert.equal((await changes()).totalDocs, 2);

  if (process.argv.includes("--http")) {
    const base = process.env.APP_URL || "";
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
    const login = async (email: string) => {
      const response = await fetch(base + "/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(response.status, 200);
      return "JWT " + (await response.json()).token;
    };
    const token = await login(operator.email);
    const outside = await login(outsider.email);
    const send = (input: unknown, authorization = token, origin = base) =>
      fetch(base + "/api/inquiry-status", {
        method: "POST",
        headers: {
          Authorization: authorization,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
    const bypass = await fetch(base + `/api/inquiries/${row.id}`, {
      method: "PATCH",
      headers: { Authorization: token, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "closed",
        coordinationStage: "closed",
        reason: nextClose.reason,
      }),
    });
    assert.equal(bypass.status, 409);
    assert.equal((await send(nextClose, "")).status, 403);
    assert.equal((await send(nextClose, outside)).status, 403);
    assert.equal((await send(nextClose, token, "https://example.invalid")).status, 403);
    assert.equal((await send({ ...nextClose, reason: " " })).status, 400);
    const lock = await p.create({
      collection: "payload-locked-documents",
      data: {
        document: { relationTo: "inquiries", value: row.id },
        user: { relationTo: "staff", value: manager.id },
      },
    });
    assert.equal((await send(nextClose)).status, 423);
    assert.equal((await read()).status, "needs-info");
    await p.delete({ collection: "payload-locked-documents", id: lock.id });
    const response = await send(nextClose);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), [
      "coordinationStage",
      "duplicate",
      "status",
      "updatedAt",
    ]);
    assert.equal(result.status, "closed");
    assert.equal(result.coordinationStage, "closed");
    const reopenHTTP = {
      ...(await command("reopen")),
      status: "processing",
      coordinationStage: "confirming",
    };
    assert.equal((await send({ ...reopenHTTP, coordinationStage: null })).status, 400);
    assert.equal((await send(reopenHTTP)).status, 200);
    assert.equal((await read()).coordinationStage, "confirming");
    assert.equal((await changes()).totalDocs, 4);
    const staleForm = await fetch(base + `/api/inquiries/${row.id}`, {
      method: "PATCH",
      headers: { Authorization: token, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "needs-info",
        coordinationStage: "received",
        updatedAt: nextClose.updatedAt,
        name: "旧表单",
      }),
    });
    assert.equal(staleForm.status, 409);
    assert.equal((await read()).coordinationStage, "confirming");
    console.log(
      "PASS inquiry status HTTP Origin, scope, REST bypass, no-store and minimal response",
    );
  }
  await p.update({ collection: "staff", id: operator.id, user: admin, data: { active: false } });
  await assert.rejects(changeInquiryStatus(p, operator, nextClose), { status: 403 });
  console.log(
    "PASS inquiry close/reopen, mandatory reasons, audit rollback, retries, scopes, legacy and reporting",
  );
} finally {
  await p.destroy();
}
process.exit(0);
