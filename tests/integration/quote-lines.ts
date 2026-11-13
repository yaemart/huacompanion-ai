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
import { reviewProvider } from "../../src/server/provider-review";
import { prepareQuoteLines } from "../../src/server/business/quote-lines";
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
const companyNameForTest = "虚构华伴公司主体";
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
  const differenceReason = "虚构内部核对：签约与收款由两个主体负责";
  const customParties = {
    ...lines[1],
    contractName: "虚构签约方",
    payeeProviderId: contracted.id,
    partyDifferenceReason: differenceReason,
  };
  const partyChange = (row: object) => ({ ...newDraft, lines: [row] });
  await assert.rejects(act(op, "quote", { ...newDraft, lineCosts: [0, null, null] }), {
    status: 403,
  });
  await assert.rejects(act(op, "quote", { ...offer, lineCosts: [0] }), { status: 403 });
  assert.equal((await read()).quotes.length, 0);
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    data: { companyName: null, allowQuoteCollection: false },
  });
  assert.equal(
    (await prepareQuoteLines(p, op, {}, partyChange(customParties), [amount]))?.lines[0].payeeName,
    "虚构已签约服务商",
  );
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    data: { companyName: "虚构华伴公司主体" },
  });
  const options = (await read(op)).quoteLineOptions;
  assert.equal(options.allowCollection, false);
  assert.equal(options.companyName, "虚构华伴公司主体");
  assert.deepEqual(options.providers.map(({ id }) => id).sort(), [vendor.id, contracted.id].sort());
  assert.equal(Object.hasOwn(options.providers[0], "email"), false);
  const companyAlias = await provider("Hua Companion · 华伴", "verified");
  const sameName = await provider(vendor.organisation, "verified");
  await assert.rejects(
    act(op, "quote", partyChange({ ...lines[1], payeeProviderId: sameName.id })),
    /请填写签约方与收款方不同的原因/,
  );
  await assert.rejects(
    act(op, "quote", partyChange({ ...customParties, partyDifferenceReason: "　 " })),
    /请填写签约方与收款方不同的原因/,
  );
  for (const override of [
    { contractName: "虚构外部签约方" },
    { payeeName: "虚构外部收款方" },
    { partyDifferenceReason: differenceReason },
    { mode: "referral" },
  ]) {
    await assert.rejects(
      act(manager, "quote", partyChange({ ...lines[0], ...override })),
      /华伴自营的经营模式和主体不可修改/,
    );
  }
  for (const row of [
    { ...customParties, payeeName: options.companyName },
    { ...customParties, payeeName: "虚构 华伴公司主体" },
    { ...customParties, payeeName: "虚构\u200B华伴公司主体" },
    { ...customParties, payeeProviderId: companyAlias.id },
    { ...lines[1], mode: "managed" },
    { ...lines[2], payeeName: "Ｈｕａ Ｃｏｍｐａｎｉｏｎ" },
    { ...lines[2], serviceName: options.companyName },
    { ...lines[2], serviceName: "Hua Companion · 华伴" },
  ]) {
    await assert.rejects(
      act(manager, "quote", partyChange(row)),
      /当前未开放代收，请改为合作对接，或联系管理员/,
    );
  }
  await assert.rejects(
    act(manager, "quote", { ...offer, lines: [{ ...amount, payeeName: options.companyName }] }),
    /主体字段须使用新版费用项/,
  );
  await assert.rejects(
    act(op, "quote", partyChange({ ...customParties, contractName: null })),
    /请填写有效的签约方/,
  );
  await assert.rejects(
    act(op, "quote", partyChange({ ...customParties, payeeName: "任意手填收款方" })),
    /请选择权限内已核实或已签约的收款方/,
  );
  for (const invalid of [paused.id, applied.id, foreign.id, 2147483647]) {
    await assert.rejects(
      act(op, "quote", {
        ...newDraft,
        lines: [{ ...amount, serviceSource: "provider", providerId: invalid }],
      }),
      { status: 400 },
    );
    await assert.rejects(
      act(op, "quote", partyChange({ ...customParties, payeeProviderId: invalid })),
      /请选择权限内已核实或已签约的收款方/,
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
  await assert.rejects(act(manager, "send", legacy.id), /另存新版/);
  await assert.rejects(
    businessAction(p, outsider, {
      action: "quote",
      id,
      baseQuote: legacy.id,
      sourceUpdatedAt: legacy.updatedAt,
      revision: (await read()).case.revision,
      key: randomUUID(),
      quote: newDraft,
    }),
    { status: 404 },
  );
  await assert.rejects(
    businessAction(p, op, {
      action: "quote",
      id,
      baseQuote: legacy.id,
      sourceUpdatedAt: "outdated",
      revision: (await read()).case.revision,
      key: randomUUID(),
      quote: newDraft,
    }),
    /来源报价已变更/,
  );
  await assert.rejects(
    businessAction(p, op, {
      action: "quote",
      id,
      baseQuote: legacy.id,
      sourceUpdatedAt: legacy.updatedAt,
      revision: (await read()).case.revision,
      key: randomUUID(),
      quote: { ...newDraft, lineCosts: [0, 0, 0] },
    }),
    { status: 403 },
  );
  const cost = 93719;
  const write = {
    action: "quote",
    id,
    baseQuote: legacy.id,
    sourceUpdatedAt: legacy.updatedAt,
    revision: (await read()).case.revision,
    key: randomUUID(),
    quote: {
      ...newDraft,
      lines: [lines[0], customParties, lines[2]],
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
  assert.equal(quote.review.state, "unsubmitted");
  assert.ok(
    view.events.some(
      (event) =>
        (event.detail as { baseQuote?: number; quote?: number }).baseQuote === legacy.id &&
        (event.detail as { quote?: number }).quote === quote.id,
    ),
  );
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
      ["referral", "虚构已核实服务商", "虚构签约方", "虚构已签约服务商"],
      ["referral", "虚构手填服务方", "虚构手填服务方", "虚构手填服务方"],
    ],
  );
  assert.equal(quote.lines[1].partyDifferenceReason, differenceReason);
  assert.equal(quote.lines[1].payeeProviderId, contracted.id);
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
  await act(op, "submit-review", quote.id);
  const reviewQuote = async (actor: Staff, confirmations: object) =>
    businessAction(p, actor, {
      action: "review",
      id,
      quote: quote.id,
      revision: (await read()).case.revision,
      quoteUpdatedAt: (await read()).quotes.find((row) => row.id === quote.id)?.updatedAt,
      decision: "approved",
      reason: "虚构逐项核对",
      confirmations,
      key: randomUUID(),
    });
  const difference = quote.lines[1].lineId!;
  await assert.rejects(reviewQuote(manager, { difference: [difference] }), { status: 403 });
  await assert.rejects(reviewQuote(admin, {}), /逐项确认/);
  await assert.rejects(reviewQuote(admin, { difference: [quote.lines[0].lineId] }), /逐项确认/);
  await assert.rejects(reviewQuote(op, { difference: [difference] }), { status: 403 });
  await assert.rejects(reviewQuote(outsider, { difference: [difference] }), { status: 404 });
  await assert.rejects(act(manager, "send", quote.id), { status: 409 });
  await reviewQuote(admin, { difference: [difference] });
  await p.updateGlobal({ slug: "public-company-settings", data: { companyName: null } });
  await assert.rejects(act(op, "send", quote.id), /配置华伴公司主体/);
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { companyName: companyNameForTest },
  });
  const pausedPayee = await reviewProvider(p, admin, {
    id: contracted.id,
    status: "paused",
    updatedAt: contracted.updatedAt,
    reason: "虚构发出前失效",
    key: randomUUID(),
  });
  await assert.rejects(act(op, "send", quote.id), /收款方/);
  await reviewProvider(p, admin, {
    id: contracted.id,
    status: "contracted",
    updatedAt: pausedPayee.updatedAt,
    reason: "虚构恢复签约",
    key: randomUUID(),
  });
  await act(op, "send", quote.id);
  await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    data: { companyName: "虚构新主体" },
  });
  const formerCompany = await provider("虚构华伴公司主体", "verified");
  await assert.rejects(
    act(op, "quote", partyChange({ ...customParties, payeeProviderId: formerCompany.id })),
    /当前未开放代收/,
  );
  await assert.rejects(
    act(op, "quote", partyChange({ ...lines[2], serviceName: formerCompany.organisation })),
    /当前未开放代收/,
  );
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
  const visible = (await customerBusinessRead(p, customer)).cases[0].quotes[0];
  assert.equal(visible.lines[1].contractName, "虚构签约方");
  assert.equal(visible.lines[1].payeeName, "虚构已签约服务商");
  for (const forbidden of [
    "lineCosts",
    "costMinor",
    "internalCostMinor",
    "providerId",
    "payeeProviderId",
    "serviceSource",
    "partyDifferenceReason",
    differenceReason,
    String(cost),
  ])
    assert.ok(!JSON.stringify(visible).includes(forbidden), forbidden);
  assert.equal(
    (await reportingExport(p, admin, { entity: "inquiries", includeSensitive: true })).csv.includes(
      String(cost),
    ),
    false,
  );
  const toggle = (allowQuoteCollection: boolean, user = admin) =>
    p.updateGlobal({
      slug: "public-company-settings",
      data: { allowQuoteCollection },
      select: { allowQuoteCollection: false },
      user,
      overrideAccess: false,
    });
  const collectionLine = {
    ...lines[1],
    collectByCompany: true,
    partyDifferenceReason: differenceReason,
    collection: { reason: "one-payment", note: "虚构代收说明，仅测试" },
  };
  const longName = await provider("长".repeat(210), "verified");
  await act(op, "quote", partyChange({ ...lines[1], providerId: longName.id }));
  const longDraft = (await read()).quotes.sort((a, b) => b.revision - a.revision)[0];
  await act(op, "submit-review", longDraft.id);
  await assert.rejects(toggle(true, manager), { status: 403 });
  await assert.rejects(toggle(true, { ...manager, role: "admin" }), { status: 403 });
  await assert.rejects(act(op, "quote", partyChange(collectionLine)), /当前未开放代收/);
  await toggle(true);
  await assert.rejects(
    act(op, "quote", partyChange({ ...collectionLine, collection: null })),
    /代收原因/,
  );
  await assert.rejects(
    act(op, "quote", partyChange({ ...collectionLine, partyDifferenceReason: undefined })),
    /签约方与收款方不同/,
  );
  await act(op, "quote", partyChange(collectionLine));
  const pendingCollection = (await read()).quotes.sort((a, b) => b.revision - a.revision)[0];
  const collectedLine = pendingCollection.lines[0].lineId!;
  const reviewCollection = async (confirmations: object, quoteUpdatedAt?: string) =>
    businessAction(p, manager, {
      action: "review",
      id,
      quote: pendingCollection.id,
      revision: (await read()).case.revision,
      quoteUpdatedAt:
        quoteUpdatedAt ??
        (await read()).quotes.find((row) => row.id === pendingCollection.id)?.updatedAt,
      decision: "approved",
      reason: "虚构转付确认",
      confirmations,
      key: randomUUID(),
    });
  assert.equal(pendingCollection.lines[0].payeeName, "虚构新主体");
  const draftAudit = (await read()).events.find((event) => {
    const detail = event.detail as { quote?: number };
    return event.action === "quote" && detail.quote === pendingCollection.id;
  });
  assert.deepEqual((draftAudit?.detail as { collectionLines?: unknown }).collectionLines, [
    { lineId: collectedLine, ...collectionLine.collection },
  ]);
  await act(op, "submit-review", pendingCollection.id);
  await assert.rejects(reviewCollection({ difference: [collectedLine] }), /逐项确认/);
  await assert.rejects(reviewCollection({ collection: [collectedLine] }), /逐项确认/);
  await assert.rejects(
    reviewCollection({ difference: [collectedLine], collection: [difference] }),
    /逐项确认/,
  );
  const confirmations = { difference: [collectedLine], collection: [collectedLine] };
  await assert.rejects(reviewCollection(confirmations, pendingCollection.updatedAt), {
    status: 409,
  });
  await reviewCollection(confirmations);
  const approval = (await read()).events.find(
    (event) =>
      event.action === "review" &&
      (event.detail as { quote?: number }).quote === pendingCollection.id,
  );
  assert.deepEqual((approval?.detail as { confirmations?: unknown }).confirmations, confirmations);
  await toggle(false);
  await assert.rejects(act(op, "send", pendingCollection.id), /当前未开放代收/);
  assert.equal((await read()).quotes.find((row) => row.id === quote.id)?.status, "sent");
  await toggle(true);
  await act(op, "send", pendingCollection.id);
  await toggle(false);
  const sentCollection = (await customerBusinessRead(p, customer)).cases[0].quotes.find(
    (row) => row.id === pendingCollection.id,
  );
  assert.equal(sentCollection?.lines[0].collectionNotice, "本项由华伴统一收款后支付给服务方");
  assert.ok(!JSON.stringify(sentCollection).includes(collectionLine.collection.note));
  assert.ok(!JSON.stringify(sentCollection).includes("confirmations"));
  await assert.rejects(reviewCollection(confirmations), { status: 409 });
  const gateAudit = (
    await p.find({
      collection: "audit-events",
      where: { action: { equals: "quote-collection-setting" } },
      sort: "-id",
      depth: 0,
      limit: 2,
    })
  ).docs;
  assert.deepEqual(
    gateAudit.map(({ actor, before, after }) => [actor, before, after]),
    [
      [admin.id, { allowQuoteCollection: true }, { allowQuoteCollection: false }],
      [admin.id, { allowQuoteCollection: false }, { allowQuoteCollection: true }],
    ],
  );
  await p.updateGlobal({ slug: "public-company-settings", data: { companyName: "虚构第三主体" } });
  const historical = (await customerBusinessRead(p, customer)).cases[0].quotes.find(
    (row) => row.id === pendingCollection.id,
  );
  assert.deepEqual(historical, sentCollection);
  await assert.rejects(
    act(op, "quote", partyChange({ ...lines[2], serviceName: "虚构新主体" })),
    /当前未开放代收/,
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
    const otherCase = await p.create({
      collection: "service-cases",
      data: {
        inquiry: (
          await p.create({
            collection: "inquiries",
            user: admin,
            data: {
              ...inquiry,
              team: other.id,
              owner: null,
              reference: "QOTHER-" + key,
              requestKey: "other-" + key,
              contentHash: "other-" + key,
            },
          })
        ).id,
        title: "虚构其他服务单",
        stage: "received",
        revision: 1,
      },
    });
    const foreignQuote = await p.create({
      collection: "service-quotes",
      data: { ...legacy, dedupe: randomUUID(), serviceCase: otherCase.id },
    });
    for (const baseQuote of [foreignQuote.id, 2147483647]) {
      const response = await fetch(base + "/api/business", {
        method: "POST",
        headers: { Authorization: operator, Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quote",
          id,
          revision: (await read()).case.revision,
          key: randomUUID(),
          baseQuote,
          sourceUpdatedAt: foreignQuote.updatedAt,
          quote: newDraft,
        }),
      });
      assert.equal(response.status, 404);
    }
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
    const postQuote = async (input: object) =>
      fetch(base + "/api/business", {
        method: "POST",
        headers: { Authorization: operator, Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quote",
          id,
          revision: (await read()).case.revision,
          key: randomUUID(),
          quote: input,
        }),
      });
    const rejected = await postQuote(partyChange({ ...lines[1], payeeName: "虚构新主体" }));
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /当前未开放代收/);
    const large = {
      ...newDraft,
      lines: Array.from({ length: 9 }, () => ({
        ...customParties,
        partyDifferenceReason: "虚".repeat(2000),
      })),
    };
    assert.ok(Buffer.byteLength(JSON.stringify(large)) > 50000);
    const saved = await postQuote(large);
    assert.equal(saved.status, 200, await saved.text());
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
    data: {
      companyName: company.companyName ?? null,
      allowQuoteCollection: company.allowQuoteCollection ?? false,
    },
  });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: customerSettings.enabled } });
  await p.destroy();
}
process.exit(0);
