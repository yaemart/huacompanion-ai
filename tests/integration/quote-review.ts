import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import type { Staff } from "../../payload-types";
import config from "../../src/payload.config";
import { businessAction, businessRead } from "../../src/server/business/service";

const dbURL = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(dbURL.hostname, "127.0.0.1");
assert.ok(
  (dbURL.port === "55442" && /^\/hua_quote_review_all_[a-f0-9]{32}$/.test(dbURL.pathname)) ||
    (dbURL.port === "55438" && dbURL.pathname === "/hua_companion" && process.env.CI === "true"),
  "Only the disposable quote review clone or CI database",
);
const p = await getPayload({ config });
const run = randomUUID();
const password = randomUUID();
const company = await p.findGlobal({ slug: "public-company-settings" });
try {
  await p.updateGlobal({ slug: "public-company-settings", data: { companyName: "虚构二审主体" } });
  const [admin] = (
    await p.find({
      collection: "staff",
      where: { role: { equals: "admin" }, active: { not_equals: false } },
      limit: 1,
    })
  ).docs;
  assert.ok(admin);
  const team = await p.create({ collection: "teams", user: admin, data: { name: "quote-" + run } });
  const foreign = await p.create({
    collection: "teams",
    user: admin,
    data: { name: "other-" + run },
  });
  const staff = (role: "operations" | "manager", teamID: number, prefix: string) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name: prefix,
        email: `${prefix}-${run}@example.invalid`,
        password,
        team: teamID,
        role,
      },
    });
  const author = await staff("operations", team.id, "author");
  const manager = await staff("manager", team.id, "manager");
  const outsider = await staff("manager", foreign.id, "outsider");
  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: "QUOTE-REVIEW-" + run,
      requestKey: run,
      contentHash: run,
      name: "虚构报价客户",
      email: "quote@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      coordinationStage: "received",
      owner: author.id,
      team: team.id,
    },
  });
  const { case: id } = await businessAction(p, author, {
    action: "create",
    title: "虚构报价二审",
    inquiry: inquiry.id,
    key: randomUUID(),
  });
  const read = (actor = admin) => businessRead(p, actor, id);
  type Extra = Omit<Parameters<typeof businessAction>[2], "action" | "id" | "revision" | "key">;
  const act = async (actor: Staff, action: string, extra: Extra) =>
    businessAction(p, actor, {
      action,
      id,
      revision: (await read()).case.revision,
      key: randomUUID(),
      ...extra,
    });
  const offer = {
    title: "虚构展会陪同",
    scope: "展会一天",
    included: "场内协调",
    excluded: "交通",
    terms: "资源确认后预约",
    currency: "CNY",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lineFormat: 2,
    lines: [{ label: "陪同服务", quantity: 2, unitMinor: 15000, serviceSource: "company" }],
  };
  const draft = async (actor: Staff, change: object = {}) => {
    await act(actor, "quote", { quote: { ...offer, ...change } });
    return (await read()).quotes.reduce((latest, quote) =>
      quote.revision > latest.revision ? quote : latest,
    );
  };
  const first = await draft(author, { reviewStatus: "approved", reviewedBy: manager.id });
  const send = (actor: Staff, quote: number) => act(actor, "send", { quote });
  const submit = (actor: Staff, quote: number) => act(actor, "submit-review", { quote });
  const review = async (actor: Staff, quote: number, change: Extra = {}) =>
    act(actor, "review", {
      quote,
      quoteUpdatedAt: (await read()).quotes.find((item) => item.id === quote)?.updatedAt,
      decision: "approved",
      reason: "虚构费用和范围逐项核对",
      ...change,
    });
  await assert.rejects(
    send(author, first.id),
    { status: 409 },
    "manual draft cannot be sent unreviewed",
  );
  assert.equal((await read()).case.latestQuote, null);
  await assert.rejects(review(manager, first.id), { status: 409 }, "draft must be submitted first");
  await assert.rejects(submit(outsider, first.id), { status: 404 });
  await submit(author, first.id);
  await assert.rejects(send(author, first.id), { status: 409 });
  await assert.rejects(review(author, first.id), { status: 403 });
  await assert.rejects(review(outsider, first.id), { status: 404 });
  await assert.rejects(review(manager, first.id, { reason: " " }), { status: 400 });
  await assert.rejects(review(manager, first.id, { quoteUpdatedAt: first.updatedAt }), {
    status: 409,
  });
  await review(manager, first.id);
  const approved = (await read()).quotes.find((quote) => quote.id === first.id)!;
  assert.equal(approved.reviewedBy, manager.id);
  assert.ok(approved.reviewedAt);
  assert.equal(approved.reviewStatus, "approved");
  const reviewEvent = (await read()).events.find((event) => event.action === "review")!;
  assert.equal(reviewEvent.actor, manager.id);
  assert.ok(reviewEvent.createdAt);
  assert.deepEqual(
    { quote: (reviewEvent.detail as { quote?: number }).quote, reason: reviewEvent.reason },
    { quote: first.id, reason: "虚构费用和范围逐项核对" },
  );
  // A trusted write simulates future in-place edits or a data repair after review.
  await p.update({
    collection: "service-quotes",
    id: first.id,
    data: { scope: "报价内容已有修改" },
  });
  await assert.rejects(send(author, first.id), { status: 409 });
  await p.update({ collection: "service-quotes", id: first.id, data: { scope: first.scope } });
  await assert.rejects(
    send(author, first.id),
    { status: 409 },
    "restoring the terms cannot restore approval",
  );
  await submit(author, first.id);
  await review(manager, first.id);
  await send(author, first.id);

  const next = await draft(author, { title: "另存后的新版本" });
  await assert.rejects(send(author, next.id), { status: 409 });
  await submit(author, next.id);
  await review(manager, next.id, { decision: "rejected" });
  await assert.rejects(send(author, next.id), { status: 409 });
  await assert.rejects(submit(author, next.id), { status: 409 });
  assert.equal((await read()).case.latestQuote, first.id);
  assert.equal((await read()).quotes.find((quote) => quote.id === first.id)?.status, "sent");

  const supervisorDraft = await draft(manager);
  await submit(manager, supervisorDraft.id);
  await assert.rejects(review(manager, supervisorDraft.id, { selfReview: true }), { status: 403 });
  await review(admin, supervisorDraft.id);
  await send(manager, supervisorDraft.id);
  const exception = await draft(admin, { lineCosts: [8000] });
  await submit(admin, exception.id);
  await assert.rejects(review(admin, exception.id), { status: 403 });
  await assert.rejects(review(admin, exception.id, { selfReview: true, reason: "" }), {
    status: 400,
  });
  await review(admin, exception.id, { selfReview: true, reason: "虚构例外原因" });
  const exceptionEvent = (await read()).events.find((event) => event.reason === "虚构例外原因")!;
  assert.equal(exceptionEvent.actor, admin.id);
  assert.equal((exceptionEvent.detail as { selfReview?: boolean }).selfReview, true);
  assert.equal(
    (await read(author)).quotes.find((quote) => quote.id === exception.id)?.lineCosts,
    undefined,
  );
  await send(admin, exception.id);

  const legacy = await draft(author, {
    lineFormat: null,
    lines: [{ label: "旧版陪同服务", quantity: 2, unitMinor: 15000 }],
  });
  await p.update({
    collection: "service-quotes",
    id: legacy.id,
    data: {
      reviewStatus: "approved",
      reviewedBy: manager.id,
      reviewedAt: new Date().toISOString(),
      reviewReason: "缺少内容绑定的历史批准",
    },
  });
  await assert.rejects(send(author, legacy.id), { status: 409 });
  await assert.rejects(submit(author, legacy.id), /另存新版/);
  await assert.rejects(review(manager, legacy.id), /另存新版/);
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
    const token = await login(author.email);
    const reviewer = await login(manager.email);
    const raw = await draft(author);
    const post = async (authorization: string, action: string, input: Extra = {}, origin = base) =>
      fetch(base + "/api/business", {
        method: "POST",
        headers: {
          Authorization: authorization,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          id,
          revision: (await read()).case.revision,
          key: randomUUID(),
          quote: raw.id,
          ...input,
        }),
      });
    const rawREST = await fetch(base + `/api/service-quotes/${raw.id}`, {
      method: "PATCH",
      headers: { Authorization: token, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus: "approved", status: "sent" }),
    });
    assert.equal(rawREST.status, 403);
    assert.equal((await post("", "send")).status, 403);
    assert.equal((await post(token, "submit-review", {}, "https://example.invalid")).status, 403);
    assert.equal((await post(token, "send")).status, 409);
    assert.equal((await post(token, "submit-review")).status, 200);
    const pending = (await read()).quotes.find((quote) => quote.id === raw.id)!;
    const input = {
      decision: "approved",
      reason: "虚构 HTTP 审核",
      quoteUpdatedAt: pending.updatedAt,
    };
    assert.equal((await post(token, "review", input)).status, 403);
    assert.equal((await post(reviewer, "review", input)).status, 200);
    const sent = await post(token, "send");
    assert.equal(sent.status, 200);
    assert.equal(sent.headers.get("cache-control"), "no-store");
    assert.equal((await read()).case.latestQuote, raw.id);
    console.log(
      "PASS staff quote workflow through HTTP, direct REST bypass rejection, origin and no-store",
    );
  }
  console.log(
    "PASS manual quote submission, scoped second-person review, audited admin exception, revision and content binding",
  );
} finally {
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { companyName: company.companyName ?? null },
  });
  await p.destroy();
}
process.exit(0);
