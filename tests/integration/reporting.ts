import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getPayload, type Payload } from "payload";
import config from "../../src/payload.config";
import type { Staff } from "../../payload-types";
import { reportingRead, reportingExport } from "../../src/server/reporting/service";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Dedicated local reporting database required");
const p = await getPayload({ config });
const run = `reporting-${randomUUID()}`;
const staffIDs: number[] = [];
const inquiryIDs: number[] = [];
const providerIDs: number[] = [];
const teams: number[] = [];
const caseIDs: number[] = [];
const quoteIDs: number[] = [];
const conversationIDs: number[] = [];
const messageIDs: number[] = [];
let admin: Staff | undefined;
try {
  admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { equals: true } }] },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  for (const suffix of ["A", "B"])
    teams.push(
      (
        await p.create({
          collection: "teams",
          user: admin,
          overrideAccess: false,
          data: { name: `${run}-${suffix}` },
        })
      ).id,
    );
  const makeStaff = async (role: Staff["role"], team: number, suffix: string) => {
    const user = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: {
        name: `${run}-${suffix}`,
        email: `${run}-${suffix}@example.invalid`,
        password: randomBytes(24).toString("hex"),
        role,
        team,
      },
    });
    staffIDs.push(user.id);
    return user;
  };
  const operator = await makeStaff("operations", teams[0], "op");
  const other = await makeStaff("operations", teams[0], "other");
  const outside = await makeStaff("operations", teams[1], "outside");
  const manager = await makeStaff("manager", teams[0], "manager");
  const editor = await makeStaff("editor", teams[0], "editor");
  const data = (suffix: string) => ({
    reference: `${run}-${suffix}`,
    requestKey: randomUUID(),
    contentHash: run,
    name: "  =1+1",
    email: `${run}@example.invalid`,
    categories: ["business" as const],
    city: "Shanghai",
    notes: "SENSITIVE NOTES",
    details: { secret: "PRIVATE SNAPSHOT" },
    source: "manual" as const,
  });
  for (const [index, owner] of [operator, other, outside].entries()) {
    const inquiry = await p.create({
      collection: "inquiries",
      user: admin,
      data: { ...data(String(index)), status: "new", team: owner.team, owner: owner.id },
    });
    inquiryIDs.push(inquiry.id);
    const provider = await p.create({
      collection: "providers",
      user: admin,
      data: {
        ...data(`p${index}`),
        status: "applied",
        organisation: "Fictional",
        phone: "000",
        languages: "English",
        capabilities: "Test",
        team: owner.team,
        owner: owner.id,
      },
    });
    providerIDs.push(provider.id);
  }
  await assert.rejects(() => reportingExport(p, editor, { entity: "inquiries", filters: {} }));
  await assert.rejects(() =>
    reportingExport(p, manager, { entity: "inquiries", filters: {}, includeSensitive: true }),
  );
  assert.equal((await reportingRead(p, operator, { status: "new" })).summary.funnel.inquiries, 1);
  assert.deepEqual(
    (await reportingRead(p, operator, { status: "new" })).summary.providerStatuses,
    {},
  );
  const normal = await reportingExport(p, operator, { entity: "inquiries", filters: {} });
  assert.equal(normal.count, 1);
  assert.ok(normal.csv.startsWith("\uFEFF"));
  assert.ok(normal.csv.includes("'  =1+1"));
  assert.ok(!normal.csv.includes("SENSITIVE") && !normal.csv.includes("PRIVATE SNAPSHOT"));
  assert.equal((await reportingExport(p, manager, { entity: "providers", filters: {} })).count, 2);
  const initial = await reportingRead(p, operator, {});
  assert.equal(initial.summary.funnel.inquiries, 1);
  assert.equal(initial.summary.providerStatuses.applied, 1);
  assert.equal(initial.summary.firstResponse.measuredCount, 0);
  assert.equal(initial.summary.firstResponse.medianMinutes, null);
  const serviceCase = await p.create({
    collection: "service-cases",
    data: { inquiry: inquiryIDs[0], title: run, stage: "awaiting-confirmation", revision: 1 },
  });
  caseIDs.push(serviceCase.id);
  const inquiry = await p.findByID({ collection: "inquiries", id: inquiryIDs[0], depth: 0 });
  const sentAt = new Date(Date.parse(inquiry.createdAt) + 600000).toISOString();
  const quote = await p.create({
    collection: "service-quotes",
    data: {
      serviceCase: serviceCase.id,
      dedupe: run,
      revision: 2,
      status: "sent",
      title: run,
      scope: "Test",
      included: "Test",
      excluded: "Test",
      terms: "Test",
      currency: "CNY",
      lines: [],
      totalMinor: 200,
      internalCostMinor: 987654321,
      expiresAt: "2030-01-01",
      sentAt,
      createdBy: admin.id,
    },
  });
  quoteIDs.push(quote.id);
  const measured = await reportingRead(p, operator, {});
  assert.deepEqual(measured.summary.funnel, { inquiries: 1, quoted: 1, won: 0 });
  assert.equal(measured.summary.firstResponse.medianMinutes, 10);
  assert.ok(!JSON.stringify(measured).includes(inquiry.reference));
  assert.ok(
    !(await reportingExport(p, manager, { entity: "inquiries", filters: {} })).csv.includes(
      "987654321",
    ),
  );
  const auditFailure = new Proxy(p, {
    get(target, key) {
      if (key === "create")
        return async () => {
          throw Error("Simulated audit storage failure");
        };
      return Reflect.get(target, key);
    },
  }) as Payload;
  await assert.rejects(
    () => reportingExport(auditFailure, operator, { entity: "inquiries", filters: {} }),
    /audit storage failure/,
  );
  const conversation = await p.create({
    collection: "support-conversations",
    data: {
      visitorHash: run,
      startKey: run,
      locale: "zh",
      mode: "human",
      status: "open",
      aiRevision: 1,
      revision: 1,
      team: teams[0],
      owner: operator.id,
      inquiryLinks: [{ reference: inquiry.reference }],
    },
  });
  conversationIDs.push(conversation.id);
  for (const [author, visibility, minutes] of [
    ["ai", "public", 1],
    ["staff", "internal", 2],
    ["staff", "public", 4],
  ] as const) {
    const message = await p.create({
      collection: "support-messages",
      data: {
        conversation: conversation.id,
        dedupe: randomUUID(),
        author,
        visibility,
        staff: operator.id,
        text: "Fictional reply",
        createdAt: new Date(Date.parse(inquiry.createdAt) + minutes * 60000).toISOString(),
      },
    });
    messageIDs.push(message.id);
  }
  assert.equal((await reportingRead(p, operator, {})).summary.firstResponse.medianMinutes, 4);
  assert.equal(
    (await reportingExport(p, operator, { entity: "inquiries", filters: { status: "quoted" } }))
      .count,
    0,
  );
  const sensitive = await reportingExport(p, admin, {
    entity: "inquiries",
    filters: {
      category: "business",
      status: "new",
      from: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
    },
    includeSensitive: true,
  });
  assert.ok(
    sensitive.csv.includes("987654321") &&
      sensitive.csv.includes("CNY") &&
      sensitive.csv.includes("SENSITIVE NOTES"),
  );
  const audit = await p.findByID({ collection: "audit-events", id: sensitive.auditId, depth: 0 });
  assert.equal(audit.actor, admin.id);
  assert.equal((audit.after as { count: number }).count, sensitive.count);
  assert.ok(audit.createdAt);
  assert.equal(
    (await reportingExport(p, operator, { entity: "inquiries", filters: { category: "medical" } }))
      .count,
    0,
  );
  assert.equal(
    (await reportingRead(p, operator, { to: "2000-01-01" })).summary.funnel.inquiries,
    0,
  );
  for (const [index, at] of ["2020-01-02T15:59:59Z", "2020-01-02T16:00:00Z"].entries()) {
    const boundary = await p.create({
      collection: "inquiries",
      user: admin,
      data: {
        ...data(`boundary${index}`),
        status: "needs-info",
        categories: ["medical"],
        team: teams[0],
        owner: operator.id,
        createdAt: at,
      },
    });
    inquiryIDs.push(boundary.id);
  }
  for (const day of ["2020-01-02", "2020-01-03"]) {
    const boundary = await reportingExport(p, operator, {
      entity: "inquiries",
      filters: { from: day, to: day, status: "needs-info", category: "medical" },
    });
    assert.equal(boundary.count, 1, "Date bounds use inclusive China calendar days");
  }
  await assert.rejects(() => reportingRead(p, operator, { owner: outside.id }));
  await p.update({
    collection: "staff",
    id: operator.id,
    user: admin,
    overrideAccess: false,
    data: { team: teams[1] },
  });
  assert.equal((await reportingExport(p, operator, { entity: "inquiries", filters: {} })).count, 0);
  await p.update({
    collection: "staff",
    id: operator.id,
    user: admin,
    overrideAccess: false,
    data: { role: "editor" },
  });
  await assert.rejects(() => reportingExport(p, operator, { entity: "inquiries", filters: {} }));
  await p.update({
    collection: "staff",
    id: manager.id,
    user: admin,
    overrideAccess: false,
    data: { active: false },
  });
  await assert.rejects(() => reportingRead(p, manager, {}));
  console.log(
    "PASS reporting: scopes, revoked staff, sensitive opt-in, actual audits, filters, formulas, aggregate and measured response",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Reporting failed");
  process.exitCode = 1;
} finally {
  for (const [collection, ids] of [
    ["support-messages", messageIDs],
    ["support-conversations", conversationIDs],
    ["service-quotes", quoteIDs],
    ["service-cases", caseIDs],
    ["inquiries", inquiryIDs],
    ["providers", providerIDs],
  ] as const)
    for (const id of ids) await p.delete({ collection, id });
  if (admin) {
    for (const id of staffIDs)
      await p.update({
        collection: "staff",
        id,
        user: admin,
        overrideAccess: false,
        data: { active: false },
      });
    for (const id of teams) await p.delete({ collection: "teams", id });
  }
  await p.destroy();
  process.exit(process.exitCode || 0);
}
