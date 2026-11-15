import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import config from "../../src/payload.config";
import { GET, POST } from "../../src/app/(frontend)/api/workflow/route";
import { businessAction } from "../../src/server/business/service";
import {
  enqueueWorkflowEvent,
  workflowAction,
  workflowRead,
} from "../../src/server/workflow/service";
import { down } from "../../src/migrations/20261115_080000_staff_daily_digest";
import { workflowEventTypes } from "../../src/lib/workflow";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const settings = await p.findGlobal({ slug: "workflow-settings" });
const origin = process.env.APP_URL!;
const endpoint = new URL("/api/workflow", origin);
const headers = { origin, "Content-Type": "application/json" };
let inquiryID: number | undefined;
try {
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const staff = (name: string) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name,
        email: `${name}-${key}@example.invalid`,
        password: key,
        role: "operations",
        team: team.id,
      },
    });
  const owner = await staff("digest-owner");
  const peer = await staff("digest-peer");
  const login = await p.login({ collection: "staff", data: { email: owner.email, password: key } });
  const authenticated = { ...headers, Authorization: `JWT ${login.token}` };
  const load = () => GET(new Request(endpoint, { headers: authenticated }));
  const preference = (enabled: unknown, auth = authenticated) =>
    POST(
      new Request(endpoint, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ action: "set-daily-digest", id: peer.id, enabled }),
      }),
    );
  assert.equal((await preference(true, { ...authenticated, Authorization: "" })).status, 403);
  assert.equal(
    (await preference(true, { ...authenticated, origin: "https://example.invalid" })).status,
    403,
  );
  assert.equal((await preference("true")).status, 400);
  assert.equal((await (await load()).json()).dailyDigestEnabled, false);
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { enabledEvents: [...workflowEventTypes], emailEnabled: true },
  });

  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      name: "虚构摘要咨询",
      email: "digest-customer@example.invalid",
      reference: key,
      requestKey: key,
      contentHash: key,
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: owner.id,
    },
  });
  inquiryID = inquiry.id;
  const verifiedAt = new Date().toISOString();
  const customer = await p.create({
    collection: "customer-accounts",
    data: { email: `digest-customer-${key}@example.invalid`, active: true, verifiedAt },
  });
  await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: customer.id,
      inquiry: inquiry.id,
      verifiedBy: admin.id,
      verificationReason: "虚构客户关系",
      verifiedAt,
      active: true,
      dedupe: key,
    },
  });
  const event = { type: "case-stage", routine: true, inquiry: inquiry.id } as const;
  const later = Date.parse("2099-11-14T11:00:00.000Z");
  const release = Date.parse("2099-11-15T01:00:00.000Z");
  const emit = (name: string, options: { now?: number; dueAt?: string } = {}) =>
    enqueueWorkflowEvent(
      p,
      { ...event, key: `${key}-${name}`, title: name, dueAt: options.dueAt },
      undefined,
      options.now ?? later,
    );
  const inbox = async (user = owner, now = release - 1) => workflowRead(p, user, now);
  const notification = async (name: string) =>
    (
      await p.find({
        collection: "workflow-notifications",
        where: { key: { equals: `${key}-${name}:${owner.id}` } },
        depth: 0,
      })
    ).docs[0];

  await emit("默认即时");
  assert.ok((await inbox()).notifications.some((item) => item.title === "默认即时"));
  assert.equal((await preference(true)).status, 200);
  assert.equal((await (await load()).json()).dailyDigestEnabled, true);
  assert.equal((await p.findByID({ collection: "staff", id: peer.id })).dailyDigestEnabled, false);
  await emit("默认即时");
  assert.equal((await notification("默认即时")).digestAt ?? null, null);

  await emit("稍后进展一");
  await emit("稍后进展二");
  await emit("跟进期限", { dueAt: new Date(later + 3600000).toISOString() });
  const queued = await notification("稍后进展一");
  assert.equal(queued.digestAt, new Date(release).toISOString());
  const customerNotice = (
    await p.find({
      collection: "workflow-customer-notifications",
      where: { key: { equals: `${key}-稍后进展一:customer:${customer.id}` } },
    })
  ).docs[0];
  assert.ok(customerNotice);
  const customerMail = await p.count({
    collection: "workflow-mail-jobs",
    where: { customerNotification: { equals: customerNotice.id }, status: { equals: "queued" } },
  });
  assert.equal(customerMail.totalDocs, 1);
  const genericAdminInbox = await p.find({
    collection: "workflow-notifications",
    user: admin,
    overrideAccess: false,
    where: { inquiry: { equals: inquiry.id } },
    pagination: false,
  });
  assert.ok(genericAdminInbox.docs.some((item) => item.title === "默认即时"));
  assert.ok(!genericAdminInbox.docs.some((item) => item.id === queued.id));
  const before = await inbox();
  assert.ok(before.notifications.some((item) => item.title === "跟进期限"));
  assert.ok(before.tasks.some((task) => task.title === "跟进期限"));
  assert.equal(
    before.digests.find((digest) => digest.date === "2099-11-15"),
    undefined,
  );
  assert.ok(!before.notifications.some((item) => item.id === queued.id));
  await assert.rejects(workflowAction(p, owner, { action: "read", id: queued.id }), /尚未送达/);

  const { case: serviceCase } = await businessAction(p, owner, {
    action: "create",
    inquiry: inquiry.id,
    key: randomUUID(),
    title: "虚构摘要服务单",
  });
  await businessAction(p, owner, {
    action: "summary",
    id: serviceCase,
    revision: 1,
    key: randomUUID(),
    customerSummary: "虚构进展",
  });
  await businessAction(p, owner, {
    action: "stage",
    id: serviceCase,
    revision: 2,
    key: randomUUID(),
    stage: "cancelled",
    reason: "虚构取消",
  });
  const actual = await p.find({
    collection: "workflow-notifications",
    where: { and: [{ inquiry: { equals: inquiry.id } }, { key: { like: "business:" } }] },
    depth: 0,
  });
  assert.ok(actual.docs.find((item) => item.title.endsWith(" · summary"))?.digestAt);
  const cancelled = actual.docs.find((item) => item.title.endsWith(" · stage"));
  assert.ok(cancelled);
  assert.equal(cancelled.digestAt ?? null, null);

  const delivered = (await inbox(owner, release)).digests.filter(
    (digest) => digest.date === "2099-11-15",
  );
  assert.equal(delivered.length, 1);
  assert.deepEqual(
    new Set(delivered[0].items.map((item) => item.title)),
    new Set(["稍后进展一", "稍后进展二"]),
  );
  for (const user of [peer, admin])
    assert.equal(
      (await inbox(user, release)).digests.some((digest) => digest.date === "2099-11-15"),
      false,
    );
  assert.equal(
    (
      await p.count({
        collection: "workflow-mail-jobs",
        where: { notification: { equals: queued.id } },
      })
    ).totalDocs,
    0,
  );
  const urgent = await notification("跟进期限");
  assert.equal(
    (
      await p.count({
        collection: "workflow-mail-jobs",
        where: { notification: { equals: urgent.id } },
      })
    ).totalDocs,
    1,
  );
  const yesterday = Date.now() - 48 * 60 * 60 * 1000;
  await emit("已送达的摘要", { now: yesterday });
  const ready = await notification("已送达的摘要");
  await assert.rejects(workflowAction(p, admin, { action: "read", id: ready.id }), /Forbidden/);
  await workflowAction(p, owner, { action: "read", id: ready.id });
  assert.ok(
    (await workflowRead(p, owner)).digests
      .flatMap((item) => item.items)
      .find((item) => item.id === ready.id)?.readAt,
  );

  assert.equal((await preference(false)).status, 200);
  await emit("关闭后即时");
  assert.ok((await inbox()).notifications.some((item) => item.title === "关闭后即时"));
  await emit("稍后进展一", { now: later + 86400000 });
  assert.equal((await notification("稍后进展一")).digestAt, queued.digestAt);
  assert.equal(
    (
      await p.count({
        collection: "workflow-mail-jobs",
        where: { notification: { equals: queued.id } },
      })
    ).totalDocs,
    0,
  );
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: admin,
    data: { owner: peer.id },
  });
  assert.ok(
    !(await inbox(owner, release)).digests
      .flatMap((item) => item.items)
      .some((item) => item.inquiry === inquiry.id),
  );
  await assert.rejects(workflowAction(p, owner, { action: "read", id: ready.id }), /Forbidden/);
  await p.update({ collection: "staff", id: owner.id, user: admin, data: { active: false } });
  assert.equal((await preference(true)).status, 403);
  await assert.rejects(
    workflowAction(p, owner, { action: "set-daily-digest", enabled: true }),
    /Unauthorized/,
  );

  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const adapter = { db: { execute: (sql: string) => db.query(sql) } };
    await assert.rejects(down(adapter as unknown as MigrateDownArgs), /Preserve staff digest/);
  } finally {
    await db.end();
  }
  console.log(
    "PASS self-service digest, Beijing release, actual business events, permissions, idempotency, and mail isolation",
  );
} finally {
  try {
    if (inquiryID) {
      const where = { inquiry: { equals: inquiryID } };
      const customerNotices = await p.find({
        collection: "workflow-customer-notifications",
        where,
        pagination: false,
      });
      if (customerNotices.docs.length)
        await p.delete({
          collection: "workflow-mail-jobs",
          where: { customerNotification: { in: customerNotices.docs.map((item) => item.id) } },
        });
      await p.delete({ collection: "workflow-customer-notifications", where });
      const notices = await p.find({
        collection: "workflow-notifications",
        where,
        pagination: false,
      });
      if (notices.docs.length)
        await p.delete({
          collection: "workflow-mail-jobs",
          where: { notification: { in: notices.docs.map((item) => item.id) } },
        });
      for (const collection of [
        "workflow-notifications",
        "workflow-tasks",
        "workflow-events",
      ] as const)
        await p.delete({ collection, where });
    }
    await p.updateGlobal({
      slug: "workflow-settings",
      data: {
        emailEnabled: settings.emailEnabled,
        enabledEvents: settings.enabledEvents,
      },
    });
  } finally {
    await p.destroy();
  }
}
process.exit(0);
