import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  businessAction,
  businessRead,
  customerBusinessRead,
} from "../../src/server/business/service";
import { businessAIAction, businessAIRead, runBusinessAIJob } from "../../src/server/business/ai";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
const db = p as any;
const run = randomUUID();
const env = { ...process.env };
let temporaryStaff: any;
let secondReviewerID: number | undefined;
let settings: any;
let companyName: string | null | undefined;
let admin: any;
const offer = {
  brief: "Two days of exhibition assistance",
  locale: "en",
  privacyConfirmed: true,
  currency: "CNY",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  lines: [{ label: "Coordination day", quantity: 2, unitMinor: 25000 }],
};
const result = {
  title: "Exhibition assistance",
  scope: "Two days of coordination",
  included: "Coordination",
  excluded: "Tickets and transport",
  terms: "Resource confirmation required",
  questions: ["Confirm venue"],
  warnings: ["Availability not confirmed"],
};
let calls = 0;
const adapter = {
  name: "injected-test-only",
  async run(input: any) {
    calls++;
    const text = JSON.stringify(input);
    assert.ok(!text.includes("PRIVATE_CUSTOMER"));
    assert.ok(!text.includes("@example.invalid"));
    assert.deepEqual(input.lines, offer.lines);
    return { result, usage: { inputTokens: 100, outputTokens: 200 } };
  },
};
try {
  admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
    })
  ).docs[0];
  const setup = async () => {
    const key = randomUUID();
    const q = await p.create({
      collection: "inquiries",
      data: {
        reference: "AI-TEST-" + key,
        requestKey: key,
        contentHash: key,
        name: "PRIVATE_CUSTOMER",
        email: key + "@example.invalid",
        details: { message: "PRIVATE_CUSTOMER confidential message" },
        categories: ["business"],
        city: "Shanghai",
        status: "new",
      },
    });
    const c = await businessAction(p, admin, {
      action: "create",
      inquiry: q.id,
      title: "Fictional AI proposal",
      key: randomUUID(),
    });
    return { id: c.case, q };
  };
  const read = (id: number) => businessRead(p, admin, id);
  const create = async (id: number) =>
    businessAIAction(p, admin, {
      action: "create",
      id,
      revision: (await read(id)).case.revision,
      key: randomUUID(),
      request: offer,
    });
  const act = async (id: number, action: string, extra: any) =>
    businessAction(p, admin, {
      action,
      id,
      revision: (await read(id)).case.revision,
      key: randomUUID(),
      ...extra,
    });
  const fixture = await setup();
  const id = fixture.id;
  process.env.BUSINESS_AI_ENABLED = "false";
  const t = await create(id);
  assert.equal(t.status, "unconfigured");
  assert.equal(await runBusinessAIJob(p, undefined), false);
  assert.equal(calls, 0);
  await assert.rejects(async () => businessAIAction(p, admin, { action: "queue", id, task: t.id }));
  Object.assign(process.env, {
    BUSINESS_AI_ENABLED: "true",
    BUSINESS_AI_ENDPOINT: "https://example.invalid/gateway",
    BUSINESS_AI_KEY: "fixture",
    BUSINESS_AI_MODEL: "fixture",
    BUSINESS_AI_DAILY_TOKENS: "1000000",
  });
  await businessAIAction(p, admin, { action: "queue", id, task: t.id });
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  assert.equal((await businessAIRead(p, admin, id)).enabled, true);
  process.env.BUSINESS_AI_ENABLED = "false";
  const history = await businessAIRead(p, admin, id);
  assert.equal(history.enabled, false);
  let tasks = history.tasks;
  assert.equal(tasks[0].status, "succeeded");
  assert.equal(tasks[0].result.quote.totalMinor, 50000);
  await assert.rejects(async () =>
    businessAIAction(p, admin, {
      action: "adopt",
      id,
      task: t.id,
      revision: (await read(id)).case.revision,
      quote: tasks[0].result.quote,
    }),
  );
  const adopted = await businessAIAction(p, admin, {
    action: "adopt",
    id,
    task: t.id,
    revision: (await read(id)).case.revision,
    quote: { ...tasks[0].result.quote, scope: "Human corrected scope" },
    checked: true,
  });
  assert.equal(
    (await businessAIAction(p, admin, { action: "adopt", id, task: t.id })).adoptedQuote,
    adopted.adoptedQuote,
  );
  process.env.BUSINESS_AI_ENABLED = "true";
  let quote = (await read(id)).quotes[0];
  assert.equal(quote.reviewStatus, "pending");
  assert.equal(quote.scope, "Human corrected scope");
  await assert.rejects(() => act(id, "send", { quote: quote.id }));
  settings = await p.findGlobal({ slug: "customer-settings" });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  const customer = await db.create({
    collection: "customer-accounts",
    data: { email: run + "@example.invalid", active: true, verifiedAt: new Date().toISOString() },
  });
  await db.create({
    collection: "customer-inquiry-links",
    data: {
      customer: customer.id,
      inquiry: fixture.q.id,
      verifiedBy: admin.id,
      verificationReason: "Local fictional test verification",
      verifiedAt: new Date().toISOString(),
      active: true,
      dedupe: run,
    },
  });
  assert.equal((await customerBusinessRead(p, customer)).cases[0].quotes.length, 0);
  await assert.rejects(
    () =>
      act(id, "review", {
        quote: quote.id,
        quoteUpdatedAt: quote.updatedAt,
        decision: "approved",
        reason: "The author cannot approve an AI quote without the administrator exception",
      }),
    { status: 409 },
  );
  const secondReviewer = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: "Fictional AI quote second reviewer",
      email: `quote-reviewer-${run}@example.invalid`,
      password: randomUUID(),
      role: "admin",
    },
  });
  secondReviewerID = secondReviewer.id;
  // Preserve the state of a legacy quote approved before the conversion requirement.
  await p.update({
    collection: "service-quotes",
    id: quote.id,
    data: {
      reviewStatus: "approved",
      reviewedBy: secondReviewer.id,
      reviewedAt: new Date().toISOString(),
      reviewReason: "Historical review",
    },
  });
  assert.equal((await read(id)).quotes[0].reviewedBy, secondReviewer.id);
  await assert.rejects(act(id, "send", { quote: quote.id }), /另存新版/);
  const oldAIQuote = (await read(id)).quotes[0];
  const oldAITask = (await businessAIRead(p, admin, id)).tasks[0];
  companyName = (await p.findGlobal({ slug: "public-company-settings" })).companyName ?? null;
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { companyName: "Fictional company" },
  });
  const copied = {
    baseQuote: oldAIQuote.id,
    sourceUpdatedAt: oldAIQuote.updatedAt,
    checked: true,
    quote: {
      ...oldAIQuote,
      lineFormat: 2,
      lines: oldAIQuote.lines.map((line) => ({
        ...line,
        serviceSource: "manual",
        serviceName: "Fictional interpreter",
      })),
    },
  };
  await assert.rejects(act(id, "quote", { ...copied, checked: false }), /逐项核对/);
  await act(id, "quote", copied);
  const newAIQuote = (await read(id)).quotes.find((row) => row.lineFormat === 2)!;
  assert.equal(newAIQuote.review.state, "unsubmitted");
  assert.equal(newAIQuote.aiTask, t.id);
  assert.deepEqual(
    (await read(id)).quotes.find((row) => row.id === oldAIQuote.id),
    oldAIQuote,
  );
  assert.deepEqual((await businessAIRead(p, admin, id)).tasks[0], oldAITask);
  await assert.rejects(act(id, "send", { quote: newAIQuote.id }), { status: 409 });
  await act(id, "submit-review", { quote: newAIQuote.id });
  await assert.rejects(
    act(id, "review", {
      quote: newAIQuote.id,
      decision: "approved",
      reason: "The author cannot approve without the administrator exception",
    }),
    { status: 403 },
  );
  await businessAction(p, secondReviewer, {
    action: "review",
    id,
    revision: (await read(id)).case.revision,
    key: randomUUID(),
    quote: newAIQuote.id,
    quoteUpdatedAt: (await read(id)).quotes.find((row) => row.id === newAIQuote.id)?.updatedAt,
    decision: "approved",
    reason: "Manually confirmed the new quote and all parties",
  });
  await act(id, "send", { quote: newAIQuote.id });
  const visible = (await customerBusinessRead(p, customer)).cases[0].quotes[0];
  assert.equal(visible.scope, "Human corrected scope");
  assert.equal("aiTask" in visible, false);
  assert.equal("reviewReason" in visible, false);
  await assert.rejects(() =>
    db.find({ collection: "business-ai-tasks", overrideAccess: false, user: null }),
  );
  const stale = await setup();
  const st = await create(stale.id);
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  await act(stale.id, "summary", { customerSummary: "Updated scope" });
  const sr = (await businessAIRead(p, admin, stale.id)).tasks[0];
  await assert.rejects(async () =>
    businessAIAction(p, admin, {
      action: "adopt",
      id: stale.id,
      task: st.id,
      revision: (await read(stale.id)).case.revision,
      quote: sr.result.quote,
      checked: true,
    }),
  );
  const changed = await setup();
  await create(changed.id);
  await runBusinessAIJob(
    p,
    {
      ...adapter,
      async run(input: any) {
        await p.update({
          collection: "inquiries",
          id: changed.q.id,
          data: { details: { message: "Changed after dispatch" } },
        });
        return adapter.run(input);
      },
    },
    { dailyTokens: 1000000 },
  );
  assert.equal((await businessAIRead(p, admin, changed.id)).tasks[0].status, "discarded");
  const cancelled = await setup();
  const ct = await create(cancelled.id);
  await runBusinessAIJob(
    p,
    {
      ...adapter,
      async run(input: any) {
        await businessAIAction(p, admin, { action: "cancel", id: cancelled.id, task: ct.id });
        return adapter.run(input);
      },
    },
    { dailyTokens: 1000000 },
  );
  assert.equal((await businessAIRead(p, admin, cancelled.id)).tasks[0].status, "cancelled");
  const budget = await setup();
  await create(budget.id);
  const before = calls;
  await runBusinessAIJob(p, adapter, { dailyTokens: 1 });
  assert.equal(calls, before);
  assert.equal((await businessAIRead(p, admin, budget.id)).tasks[0].status, "failed");
  const malformed = await setup();
  await create(malformed.id);
  await runBusinessAIJob(
    p,
    {
      name: "bad-test",
      async run() {
        return { result: { ...result, totalMinor: 1 }, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
    { dailyTokens: 1000000 },
  );
  assert.equal((await businessAIRead(p, admin, malformed.id)).tasks[0].status, "failed");
  const timeout = await setup();
  await create(timeout.id);
  await runBusinessAIJob(
    p,
    {
      name: "timeout-test",
      async run() {
        return new Promise(() => {});
      },
    },
    { dailyTokens: 1000000, timeoutMs: 5 },
  );
  assert.equal((await businessAIRead(p, admin, timeout.id)).tasks[0].status, "failed");
  temporaryStaff = await p.create({
    collection: "staff",
    user: admin,
    data: {
      email: run + "-staff@example.invalid",
      password: randomUUID() + "aA!1",
      name: "AI temporary test admin",
      role: "admin",
      active: true,
    },
  });
  const revoked = await setup();
  await businessAIAction(p, temporaryStaff, {
    action: "create",
    id: revoked.id,
    revision: (await read(revoked.id)).case.revision,
    key: randomUUID(),
    request: offer,
  });
  await p.update({
    collection: "staff",
    id: temporaryStaff.id,
    user: admin,
    data: { active: false },
  });
  const beforeRevoked = calls;
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  assert.equal(calls, beforeRevoked);
  assert.equal((await businessAIRead(p, admin, revoked.id)).tasks[0].status, "discarded");

  const findings: string[] = [];
  const expired = await setup();
  const et = await create(expired.id);
  await runBusinessAIJob(
    p,
    {
      ...adapter,
      async run(input: any) {
        await db.update({
          collection: "business-ai-tasks",
          id: et.id,
          data: { leaseUntil: new Date(Date.now() - 1000).toISOString() },
        });
        return adapter.run(input);
      },
    },
    { dailyTokens: 1000000 },
  );
  if ((await businessAIRead(p, admin, expired.id)).tasks[0].status === "succeeded")
    findings.push("Expired lease accepted a late result");
  await p.update({
    collection: "staff",
    id: temporaryStaff.id,
    user: admin,
    data: { active: true },
  });
  const revokedAfter = await setup();
  const rt = await businessAIAction(p, temporaryStaff, {
    action: "create",
    id: revokedAfter.id,
    revision: (await read(revokedAfter.id)).case.revision,
    key: randomUUID(),
    request: offer,
  });
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  const rr = (await businessAIRead(p, admin, revokedAfter.id)).tasks[0];
  assert.equal(rr.status, "succeeded");
  await p.update({
    collection: "staff",
    id: temporaryStaff.id,
    user: admin,
    data: { active: false },
  });
  try {
    await businessAIAction(p, admin, {
      action: "adopt",
      id: revokedAfter.id,
      task: rt.id,
      revision: (await read(revokedAfter.id)).case.revision,
      quote: rr.result.quote,
      checked: true,
    });
    findings.push("Revoked creator result adopted");
  } catch {}
  const correction = await setup();
  const cor = await create(correction.id);
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  const cr = (await businessAIRead(p, admin, correction.id)).tasks[0];
  const direct = await setup();
  const directTask = await create(direct.id);
  await runBusinessAIJob(p, adapter, { dailyTokens: 1000000 });
  const directResult = (await businessAIRead(p, admin, direct.id)).tasks[0];
  const directInput = {
    sourceTask: directTask.id,
    sourceUpdatedAt: directResult.updatedAt,
    checked: true,
    quote: {
      ...directResult.result.quote,
      lineFormat: 2,
      lines: offer.lines.map((line) => ({
        ...line,
        serviceSource: "company",
      })),
    },
  };
  await assert.rejects(act(correction.id, "quote", directInput), { status: 404 });
  await act(direct.id, "quote", directInput);
  const adoptedNew = (await read(direct.id)).quotes[0];
  assert.equal(adoptedNew.aiTask, directTask.id);
  assert.equal(adoptedNew.review.state, "unsubmitted");
  const retained = (await businessAIRead(p, admin, direct.id)).tasks[0];
  assert.equal(retained.adoptedQuote, adoptedNew.id);
  assert.deepEqual(retained.result, directResult.result);
  const ca = await businessAIAction(p, admin, {
    action: "adopt",
    id: correction.id,
    task: cor.id,
    revision: (await read(correction.id)).case.revision,
    quote: cr.result.quote,
    checked: true,
  });
  await p.update({
    collection: "service-quotes",
    id: ca.adoptedQuote!,
    data: { reviewStatus: "rejected", reviewReason: "Historical review requested correction" },
  });
  await assert.rejects(() => act(correction.id, "send", { quote: ca.adoptedQuote }));
  try {
    const revised = await businessAIAction(p, admin, {
      action: "revise",
      id: correction.id,
      task: cor.id,
      baseQuote: ca.adoptedQuote,
      revision: (await read(correction.id)).case.revision,
      key: randomUUID(),
      quote: { ...cr.result.quote, scope: "Corrected after review" },
      checked: true,
    });
    const qr = (await read(correction.id)).quotes.find((x: any) => x.id === revised.quote);
    assert.ok(qr?.aiTask);
    assert.equal(qr.reviewStatus, "pending");
    await assert.rejects(() => act(correction.id, "send", { quote: qr.id }));
  } catch {
    findings.push("Rejected AI quote cannot be revised with approval reset");
  }
  assert.deepEqual(findings, []);
  console.log(
    "PASS business AI: disabled/no call, confirmed pricing, private context, editable " +
      "adoption, idempotency, mandatory human review, customer privacy, stale source, " +
      "cancellation, budget, malformed output, timeout and revoked actor",
  );
} finally {
  if (companyName !== undefined)
    await p.updateGlobal({ slug: "public-company-settings", data: { companyName } });
  if (settings)
    await p.updateGlobal({ slug: "customer-settings", data: { enabled: settings.enabled } });
  // Preserve linked test history while retiring the temporary administrator roles.
  for (const id of [secondReviewerID, temporaryStaff?.id]) {
    if (!id) continue;
    await p.update({
      collection: "staff",
      id,
      user: admin,
      data: { role: "operations", active: false },
    });
  }
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  await p.destroy();
}
process.exit(0);
