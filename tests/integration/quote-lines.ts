import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload, type Payload } from "payload";
import pg from "pg";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import type { Staff } from "../../payload-types";
import config from "../../src/payload.config";
import {
  businessAction,
  businessRead,
  customerBusinessRead,
} from "../../src/server/business/service";
import { reportingExport } from "../../src/server/reporting/service";
import { down } from "../../src/migrations/20261113_100000_quote_line_foundation";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const password = randomUUID();
const company = await p.findGlobal({ slug: "public-company-settings" });
const customerSettings = await p.findGlobal({ slug: "customer-settings" });
try {
  const [admin] = (
    await p.find({
      collection: "staff",
      where: { role: { equals: "admin" }, active: { not_equals: false } },
      limit: 1,
    })
  ).docs;
  assert.ok(admin);
  const team = await p.create({ collection: "teams", user: admin, data: { name: key } });
  const other = await p.create({
    collection: "teams",
    user: admin,
    data: { name: "other-" + key },
  });
  const staff = (name: string, role: "manager" | "operations", teamID: number) =>
    p.create({
      collection: "staff",
      user: admin,
      data: { name, role, team: teamID, email: `${name}-${key}@example.invalid`, password },
    });
  const op = await staff("line-operator", "operations", team.id);
  const manager = await staff("line-manager", "manager", team.id);
  const outsider = await staff("line-outsider", "manager", other.id);
  const provider = (
    organisation: string,
    status: "verified" | "contracted" | "applied" | "paused",
    teamID = team.id,
  ) =>
    p.create({
      collection: "providers",
      user: admin,
      data: {
        name: "虚构联系人",
        email: "provider@example.invalid",
        organisation,
        status,
        team: teamID,
        ...(teamID === team.id ? { owner: op.id } : {}),
        requestKey: randomUUID(),
        contentHash: key,
        reference: "QPROV-" + randomUUID(),
        city: "Shanghai",
        languages: "English",
        phone: "000",
        capabilities: "虚构会务",
        categories: ["business"],
      },
    });
  const vendor = await provider("虚构已核实服务商", "verified");
  const contracted = await provider("虚构已签约服务商", "contracted");
  const paused = await provider("虚构暂停服务商", "paused");
  const applied = await provider("虚构未核实申请", "applied");
  const foreign = await provider("虚构其他团队服务商", "verified", other.id);
  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      name: "虚构报价客户",
      email: `${key}@example.invalid`,
      reference: "QLINES-" + key,
      requestKey: key,
      contentHash: key,
      team: team.id,
      owner: op.id,
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      coordinationStage: "received",
    },
  });
  const { case: id } = await businessAction(p, op, {
    action: "create",
    inquiry: inquiry.id,
    title: "虚构服务单",
    key,
  });
  const read = (user: Staff = manager) => businessRead(p, user, id);
  const act = async (user: Staff, action: string, quote: unknown, requestKey = randomUUID()) =>
    businessAction(p, user, {
      action,
      quote,
      id,
      revision: (await read()).case.revision,
      key: requestKey,
    });
  const amount = { label: "虚构费用", quantity: 2, unitMinor: 23000 };
  const offer = {
    title: "虚构报价",
    scope: "协调",
    included: "口译",
    excluded: "交通",
    terms: "核实后安排",
    currency: "CNY",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lines: [amount],
  };
  const lines = [
    { ...amount, serviceSource: "company" },
    { ...amount, serviceSource: "provider", providerId: vendor.id },
    { ...amount, serviceSource: "manual", serviceName: "虚构手填服务方" },
  ];
  const newDraft = { ...offer, lineFormat: 2, lines };
  await assert.rejects(act(op, "quote", { ...newDraft, lineCosts: [0, null, null] }), {
    status: 403,
  });
  await assert.rejects(act(op, "quote", { ...offer, lineCosts: [0] }), { status: 403 });
  assert.equal((await read()).quotes.length, 0);
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    data: { companyName: "虚构华伴公司主体" },
  });
  const options = (await read(op)).quoteLineOptions;
  assert.equal(options.companyName, "虚构华伴公司主体");
  assert.deepEqual(options.providers.map(({ id }) => id).sort(), [vendor.id, contracted.id].sort());
  assert.equal(Object.hasOwn(options.providers[0], "email"), false);
  for (const invalid of [paused.id, applied.id, foreign.id, 2147483647]) {
    await assert.rejects(
      act(op, "quote", {
        ...newDraft,
        lines: [{ ...amount, serviceSource: "provider", providerId: invalid }],
      }),
      { status: 400 },
    );
  }
  for (const rejected of [
    { ...newDraft, internalCostMinor: 18 },
    { ...newDraft, lineCosts: [0, 1] },
    { ...newDraft, lineCosts: [0, 1.5, null] },
    { ...newDraft, lines: [{ ...lines[0], mode: "referral" }] },
    { ...newDraft, lines: [{ ...lines[1], payeeName: "虚构华伴公司主体" }] },
    { ...newDraft, lines: [{ ...lines[2], costMinor: 10 }] },
  ])
    await assert.rejects(act(manager, "quote", rejected), { status: 400 });
  assert.equal((await read()).quotes.length, 0);

  await act(manager, "quote", { ...offer, internalCostMinor: 67321 });
  const legacy = (
    await p.find({ collection: "service-quotes", where: { serviceCase: { equals: id } }, depth: 0 })
  ).docs[0];
  const cost = 93719;
  const write = {
    action: "quote",
    id,
    revision: (await read()).case.revision,
    key: randomUUID(),
    quote: {
      ...newDraft,
      lineCosts: [0, null, cost],
    },
  };
  const failedStorage = new Proxy(p, {
    get(target, property, receiver) {
      if (property === "create")
        return (input: Parameters<Payload["create"]>[0]) => {
          if (input.collection === "service-quote-line-costs")
            throw Error("test cost insert failure");
          return target.create(input);
        };
      return Reflect.get(target, property, receiver);
    },
  });
  await assert.rejects(businessAction(failedStorage, manager, write), /test cost insert failure/);
  assert.equal((await read()).quotes.length, 1);
  assert.equal((await read()).case.revision, write.revision);
  await businessAction(p, manager, write);
  assert.equal((await businessAction(p, manager, write)).duplicate, true);
  const view = await read();
  const quote = view.quotes.find((row) => row.lineFormat === 2)!;
  assert.equal(quote.totalMinor, 138000);
  assert.equal(quote.internalCostMinor ?? null, null);
  assert.equal(view.quotes.find((row) => row.id === legacy.id)?.internalCostMinor, 67321);
  assert.deepEqual(
    await p.findByID({ collection: "service-quotes", id: legacy.id, depth: 0 }),
    legacy,
  );
  assert.equal(new Set(quote.lines.map(({ lineId }) => lineId)).size, 3);
  assert.deepEqual(
    quote.lines.map(({ mode, serviceName, contractName, payeeName }) => [
      mode,
      serviceName,
      contractName,
      payeeName,
    ]),
    [
      ["managed", "虚构华伴公司主体", "虚构华伴公司主体", "虚构华伴公司主体"],
      ["referral", "虚构已核实服务商", "虚构已核实服务商", "虚构已核实服务商"],
      ["referral", "虚构手填服务方", "虚构手填服务方", "虚构手填服务方"],
    ],
  );
  assert.deepEqual(
    quote.lineCosts?.sort((a, b) => a.costMinor - b.costMinor),
    [
      { lineId: quote.lines[0].lineId, costMinor: 0 },
      { lineId: quote.lines[2].lineId, costMinor: cost },
    ],
  );
  const rawCosts = await p.find({
    collection: "service-quote-line-costs",
    where: { quote: { equals: quote.id } },
  });
  assert.equal(rawCosts.totalDocs, 2);
  const rollbackDB = new pg.Client({ connectionString: url.toString() });
  await rollbackDB.connect();
  try {
    const args = { db: { execute: (statement: string) => rollbackDB.query(statement) } };
    await assert.rejects(
      down(args as unknown as MigrateDownArgs),
      /Preserve new quote revisions and costs/,
    );
  } finally {
    await rollbackDB.end();
  }
  assert.equal((await read()).quotes.find((row) => row.id === quote.id)?.lineCosts?.length, 2);
  assert.ok(
    !JSON.stringify(await p.findByID({ collection: "service-quotes", id: quote.id })).includes(
      String(cost),
    ),
  );
  const ordinary = await read(op);
  for (const forbidden of [
    "lineCosts",
    "internalCostMinor",
    "costMinor",
    String(cost),
    "fingerprint",
  ])
    assert.ok(!JSON.stringify(ordinary).includes(forbidden), forbidden);
  await assert.rejects(read(outsider), { status: 404 });
  await assert.rejects(
    p.find({ collection: "service-quote-line-costs", user: manager, overrideAccess: false }),
    { status: 403 },
  );
  await assert.rejects(act(op, "submit-review", quote.id), { status: 409 });
  await assert.rejects(act(manager, "send", quote.id), { status: 409 });
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    data: { companyName: "虚构新主体" },
  });
  await p.update({
    collection: "providers",
    id: vendor.id,
    user: admin,
    data: { organisation: "虚构新服务商名" },
  });
  assert.equal(
    (await read()).quotes.find((row) => row.id === quote.id)?.lines[1].serviceName,
    "虚构已核实服务商",
  );
  assert.equal(
    (await read()).quotes.find((row) => row.id === quote.id)?.lines[0].serviceName,
    "虚构华伴公司主体",
  );

  const customer = await p.create({
    collection: "customer-accounts",
    data: { email: `${key}@example.invalid`, active: true, verifiedAt: new Date().toISOString() },
  });
  await p.create({
    collection: "customer-inquiry-links",
    data: {
      customer: customer.id,
      inquiry: inquiry.id,
      active: true,
      verifiedBy: admin.id,
      verifiedAt: new Date().toISOString(),
      verificationReason: "虚构联结",
      dedupe: key,
    },
  });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  // A trusted fixture marks a quote sent to exercise the real customer projection.
  await p.update({
    collection: "service-quotes",
    id: quote.id,
    data: { status: "sent", sentAt: new Date().toISOString() },
  });
  const visible = (await customerBusinessRead(p, customer)).cases[0].quotes[0];
  assert.equal(visible.lines[1].contractName, "虚构已核实服务商");
  for (const forbidden of [
    "lineCosts",
    "costMinor",
    "internalCostMinor",
    "providerId",
    "serviceSource",
    String(cost),
  ])
    assert.ok(!JSON.stringify(visible).includes(forbidden), forbidden);
  assert.equal(
    (await reportingExport(p, admin, { entity: "inquiries", includeSensitive: true })).csv.includes(
      String(cost),
    ),
    false,
  );
  await p.update({
    collection: "staff",
    id: manager.id,
    user: admin,
    data: { role: "operations" },
  });
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: admin,
    data: { owner: manager.id },
  });
  assert.equal(
    (await read(manager)).quotes.find((row) => row.id === quote.id)?.lineCosts,
    undefined,
  );
  await assert.rejects(businessAction(p, manager, write), { status: 403 });
  await assert.rejects(
    businessAction(p, manager, {
      ...write,
      quote: { ...newDraft, lineCosts: [0, null, cost + 1] },
    }),
    { status: 403 },
  );
  await p.update({ collection: "staff", id: manager.id, user: admin, data: { role: "manager" } });
  await p.update({ collection: "inquiries", id: inquiry.id, user: admin, data: { owner: op.id } });

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
    const operator = await login(op.email);
    const supervisor = await login(manager.email);
    const readHTTP = async (authorization: string) => {
      const response = await fetch(base + `/api/business?id=${id}`, {
        headers: { Authorization: authorization },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return (await response.json()).quotes.find((row: { id: number }) => row.id === quote.id);
    };
    assert.equal(Object.hasOwn(await readHTTP(operator), "lineCosts"), false);
    assert.equal((await readHTTP(supervisor)).lineCosts.length, 2);
    for (const authorization of ["", operator, supervisor]) {
      const raw = await fetch(base + "/api/service-quote-line-costs", {
        headers: { Authorization: authorization },
      });
      assert.equal(raw.status, 403);
    }
    console.log("PASS HTTP private cost collection denied, scoped manager DTO only and no-store");
  }
  console.log(
    "PASS quote parties, role/scoped costs, private storage, legacy snapshots and customer/CSV projection",
  );
} finally {
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { companyName: company.companyName ?? null },
  });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: customerSettings.enabled } });
  await p.destroy();
}
process.exit(0);
