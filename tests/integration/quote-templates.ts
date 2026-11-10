import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { businessAction, businessRead } from "../../src/server/business/service";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_templates_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
  "Disposable quote test database required",
);
const p = await getPayload({ config });
const slug = "quote-template-settings";
const key = randomUUID();
const admin = await p.create({
  collection: "staff",
  context: { allowLocalStaffSetup: true },
  data: { name: key, email: `${key}@example.invalid`, password: randomUUID(), role: "admin" },
});
const access = { user: admin, overrideAccess: false };
const original = await p.findGlobal({ slug, ...access, depth: 0 });
try {
  const team = await p.create({ collection: "teams", ...access, data: { name: key } });
  const otherTeam = await p.create({
    collection: "teams",
    ...access,
    data: { name: key + "-other" },
  });
  const staff = (suffix: string, teamID = team.id) =>
    p.create({
      collection: "staff",
      ...access,
      data: {
        name: suffix,
        email: `${key}-${suffix}@example.invalid`,
        password: randomUUID(),
        role: "operations",
        team: teamID,
      },
    });
  const op = await staff("owner");
  const foreign = await staff("other", otherTeam.id);
  const business = {
    category: "business" as const,
    enabled: true,
    included: "虚构翻译",
    excluded: "门票",
    terms: "先确认再变更",
  };
  const update = (templates: NonNullable<typeof original.templates>) =>
    p.updateGlobal({ slug, ...access, data: { templates } });
  await assert.rejects(() => p.findGlobal({ slug, overrideAccess: false }), { status: 403 });
  await assert.rejects(() => p.findGlobal({ slug, user: op, overrideAccess: false }), {
    status: 403,
  });
  await assert.rejects(
    () =>
      p.updateGlobal({ slug, user: op, overrideAccess: false, data: { templates: [business] } }),
    { status: 403 },
  );
  await assert.rejects(() => update([business, business]), { status: 400 });
  await assert.rejects(() => update([{ ...business, terms: " " }]), { status: 400 });
  await assert.rejects(
    () => update([{ ...business, category: "invalid" as typeof business.category }]),
    { status: 400 },
  );
  await update([
    business,
    { ...business, category: "transport", enabled: false },
    { ...business, category: "arrival" },
  ]);
  await assert.rejects(() => update([null] as unknown as Parameters<typeof update>[0]), {
    status: 400,
  });
  assert.equal((await p.findGlobal({ slug, ...access })).templates?.length, 3);
  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: key,
      requestKey: randomUUID(),
      contentHash: key,
      status: "new",
      name: "Fictional request",
      email: `${key}@example.invalid`,
      categories: ["business", "transport"],
      city: "Shanghai",
      owner: op.id,
      team: team.id,
    },
  });
  const { case: id } = await businessAction(p, op, {
    action: "create",
    inquiry: inquiry.id,
    title: "Fictional quote template test",
    key: randomUUID(),
  });
  await assert.rejects(() => businessRead(p, foreign, id));
  const view = await businessRead(p, op, id);
  const { enabled, ...terms } = business;
  assert.equal(enabled, true);
  assert.deepEqual(view.quoteTemplates, [terms]);
  const expiry = new Date(Date.now() + 86400000);
  const chinaInput = new Date(+expiry + 8 * 3600000).toISOString().slice(0, 16);
  const quote = {
    title: "Test quote",
    scope: "Fictional scope",
    included: terms.included,
    excluded: terms.excluded,
    terms: terms.terms,
    currency: "CNY",
    expiresAt: chinaInput,
    lines: [{ label: "Test fee", quantity: 2, unitMinor: 12550 }],
  };
  const save = (data: typeof quote & { internalCostMinor?: number }) =>
    businessAction(p, op, {
      action: "quote",
      id,
      revision: view.case.revision,
      key: randomUUID(),
      quote: data,
    });
  await assert.rejects(() => save({ ...quote, internalCostMinor: 1 }), { status: 403 });
  await save(quote);
  await update([{ ...business, enabled: false, included: "新模板内容" }]);
  const after = await businessRead(p, op, id);
  assert.deepEqual(after.quoteTemplates, []);
  assert.equal(after.quotes[0].included, quote.included);
  assert.equal(after.quotes[0].totalMinor, 25100);
  assert.equal(
    after.quotes[0].expiresAt,
    new Date(Math.floor(+expiry / 60000) * 60000).toISOString(),
  );
  console.log("PASS quote template ACL, validation, scoped projection, snapshots and expiry");
} finally {
  await p.updateGlobal({ slug, ...access, data: { templates: original.templates ?? [] } });
  await p.destroy();
}
process.exit(0);
