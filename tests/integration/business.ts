import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  businessAction,
  businessRead,
  confirmQuote,
  customerBusinessRead,
} from "../../src/server/business/service";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
const db = p as any;
const run = randomUUID();
let admin: any;
let settings: any;
try {
  admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
    })
  ).docs[0];
  settings = await p.findGlobal({ slug: "customer-settings" });
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  const q = await p.create({
    collection: "inquiries",
    data: {
      reference: "BUSINESS-TEST-" + run,
      requestKey: run,
      contentHash: run,
      name: "Fictional business customer",
      email: run + "@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
    },
  });
  const customer = await db.create({
    collection: "customer-accounts",
    data: { email: run + "@example.invalid", active: true, verifiedAt: new Date().toISOString() },
  });
  const outsider = await db.create({
    collection: "customer-accounts",
    data: {
      email: "other-" + run + "@example.invalid",
      active: true,
      verifiedAt: new Date().toISOString(),
    },
  });
  await db.create({
    collection: "customer-inquiry-links",
    data: {
      customer: customer.id,
      inquiry: q.id,
      verifiedBy: admin.id,
      verificationReason: "Fictional evidence confirmed with customer",
      verifiedAt: new Date().toISOString(),
      active: true,
      dedupe: run,
    },
  });
  const created = await businessAction(p, admin, {
    action: "create",
    inquiry: q.id,
    title: "Fictional exhibition support",
    key: randomUUID(),
  });
  const id = created.case;
  const read = () => businessRead(p, admin, id);
  const act = async (action: string, extra: any = {}) =>
    businessAction(p, admin, {
      action,
      id,
      revision: (await read()).case.revision,
      key: randomUUID(),
      ...extra,
    });
  await assert.rejects(() =>
    act("stage", { stage: "completed", reason: "Cannot skip fulfilment" }),
  );
  const offer = {
    title: "Exhibition support",
    scope: "Meeting assistance",
    included: "Interpreter coordination",
    excluded: "Travel tickets",
    terms: "No booking until resources confirmed",
    currency: "CNY",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lines: [{ label: "Coordination", quantity: 2, unitMinor: 15000 }],
    internalCostMinor: 10000,
  };
  const key = randomUUID();
  const input = { action: "quote", id, revision: (await read()).case.revision, key, quote: offer };
  await businessAction(p, admin, input);
  assert.equal((await businessAction(p, admin, input)).duplicate, true);
  await assert.rejects(() =>
    businessAction(p, admin, { ...input, quote: { ...offer, title: "Changed" } }),
  );
  const privateDraft = (await read()).quotes[0];
  await act("withdraw", { quote: privateDraft.id, reason: "Discard internal draft" });
  assert.equal(
    (await customerBusinessRead(p, customer)).cases[0].quotes.length,
    0,
    "Unsent withdrawn draft must remain private",
  );
  await act("quote", { quote: offer });
  let quote = (await read()).quotes.find((q: any) => q.status === "draft");
  await assert.rejects(() => confirmQuote(p, customer, { quote: quote.id, key: randomUUID() }));
  await act("send", { quote: quote.id });
  await assert.rejects(() => confirmQuote(p, outsider, { quote: quote.id, key: randomUUID() }));
  const view = await customerBusinessRead(p, customer);
  assert.equal(view.cases[0].quotes[0].totalMinor, 30000);
  assert.equal("internalCostMinor" in view.cases[0].quotes[0], false);
  await act("quote", { quote: { ...offer, title: "Revised support" } });
  let updated = (await read()).quotes.find((x: any) => x.status === "draft");
  await act("send", { quote: updated.id });
  await assert.rejects(() => confirmQuote(p, customer, { quote: quote.id, key: randomUUID() }));
  const confirmations = await Promise.all([
    confirmQuote(p, customer, { quote: updated.id, key: randomUUID() }),
    confirmQuote(p, customer, { quote: updated.id, key: randomUUID() }),
  ]);
  assert.equal(confirmations.filter((x) => x.duplicate).length, 1);
  assert.equal((await read()).case.stage, "accepted");
  await assert.rejects(() =>
    act("stage", { stage: "scheduled", reason: "Resources not yet confirmed" }),
  );
  await act("arrange", {
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    publicArrangement: "Meet at venue information desk",
    internalArrangement: "INTERNAL HANDOVER",
    resourceConfirmed: true,
  });
  assert.ok((await customerBusinessRead(p, customer)).cases[0].publicArrangement);
  await act("quote", { quote: { ...offer, title: "Changed after arrangement" } });
  const replacement = (await read()).quotes.find((x: any) => x.status === "draft");
  await act("send", { quote: replacement.id });
  const resetView = (await customerBusinessRead(p, customer)).cases[0];
  assert.equal(resetView.publicArrangement, "");
  assert.equal(resetView.scheduledAt, null);
  await confirmQuote(p, customer, { quote: replacement.id, key: randomUUID() });
  await act("arrange", {
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    publicArrangement: "New confirmed meeting point",
    internalArrangement: "INTERNAL HANDOVER",
    resourceConfirmed: true,
  });
  await act("stage", { stage: "scheduled", reason: "Actual resources verified" });
  await act("stage", { stage: "in-service", reason: "Service started" });
  await act("stage", { stage: "completed", reason: "Service completed and handed over" });
  assert.equal((await read()).case.stage, "completed");
  assert.equal(
    JSON.stringify(await customerBusinessRead(p, customer)).includes("INTERNAL HANDOVER"),
    false,
  );
  await db.update({
    collection: "customer-inquiry-links",
    where: { customer: { equals: customer.id } },
    data: { active: false },
  });
  await assert.rejects(() => confirmQuote(p, customer, { quote: updated.id, key: randomUUID() }));
  assert.equal((await customerBusinessRead(p, customer)).cases.length, 0);
  assert.ok(
    (await db.count({ collection: "workflow-events", where: { inquiry: { equals: q.id } } }))
      .totalDocs > 0,
  );
  await p.updateGlobal({ slug: "customer-settings", data: { enabled: false } });
  await assert.rejects(() => confirmQuote(p, customer, { quote: updated.id, key: randomUUID() }));
  console.log(
    "PASS business immutable quotes, integer totals, scope, stale revisions, replacement/duplicate confirmations, fulfilment gates, privacy and linked notifications",
  );
} finally {
  if (settings)
    await p.updateGlobal({ slug: "customer-settings", data: { enabled: settings.enabled } });
  await p.destroy();
}
process.exit(0);
