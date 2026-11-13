import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readStaffToday } from "../../src/server/workflow/staff-today";
import { businessAction, businessRead } from "../../src/server/business/service";
import { workflowAction } from "../../src/server/workflow/service";
import type { Staff } from "../../payload-types";

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
const now = Date.parse("2026-11-14T03:00:00Z");
const company = await p.findGlobal({ slug: "public-company-settings" });
try {
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const otherTeam = await p.create({ collection: "teams", data: { name: "other-" + key } });
  const staff = (role: Staff["role"], name: string, teamID = team.id) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name,
        email: `${name}-${key}@example.invalid`,
        password,
        role,
        team: teamID,
        ...(role === "reviewer" && { contentKinds: ["guide", "immigration-policy"] }),
      },
    });
  const op = await staff("operations", "today-op");
  const teammate = await staff("operations", "today-peer");
  const reviewer = await staff("reviewer", "today-review");
  const manager = await staff("manager", "today-manager");
  const outsider = await staff("manager", "today-foreign", otherTeam.id);
  const inquiry = (
    suffix: string,
    owner: Staff,
    status: "new" | "processing" | "closed",
    due?: string,
  ) =>
    p.create({
      collection: "inquiries",
      user: admin,
      data: {
        reference: `TODAY-${key}-${suffix}`,
        requestKey: randomUUID(),
        contentHash: key,
        status,
        name: "虚构客户敏感姓名",
        email: "private-fixture@example.invalid",
        city: "Shanghai",
        categories: ["business"],
        team: owner.team!,
        owner: owner.id,
        nextFollowUp: due,
      },
    });
  const due = await inquiry("due", op, "processing", "2026-11-14T08:00:00Z");
  const fresh = await inquiry("new", op, "new");
  const future = await inquiry("future", op, "processing", "2026-11-14T16:00:00Z");
  const closed = await inquiry("closed", op, "closed", "2026-11-14T00:00:00Z");
  const peer = await inquiry("peer", teammate, "new");
  const task = (title: string, owner: Staff, source: number, status: "open" | "done" = "open") =>
    p.create({
      collection: "workflow-tasks",
      data: {
        title,
        status,
        inquiry: source,
        assignee: owner.id,
        key: randomUUID(),
        dueAt: "2026-11-13T18:00:00Z",
      },
    });
  const mine = await task("虚构 E10 待办", op, due.id);
  const wrong = await task("越权待办", op, peer.id);
  const finished = await task("已完成待办", op, due.id, "done");
  const peerTask = await task("同事待办", teammate, due.id);
  const today = (actor: Staff) => readStaffToday(p, actor, now).then((result) => result.items);
  const opItems = await today(op);
  assert.deepEqual(
    opItems.map((item) => item.id),
    [`task-${mine.id}`, `inquiry-${due.id}`, `inquiry-${fresh.id}`],
  );
  assert.equal(opItems[0].href, `/workflow-center?task=${mine.id}`);
  assert.equal(opItems[1].href, `/admin/collections/inquiries/${due.id}`);
  assert.ok(!/private-fixture|敏感姓名/.test(JSON.stringify(opItems)));
  for (const id of [due.id, fresh.id, future.id, closed.id, peer.id])
    assert.ok(!(await today(manager)).some((item) => item.id === `inquiry-${id}`));
  assert.ok(
    !(await today(manager)).some((item) =>
      [mine.id, wrong.id, finished.id, peerTask.id].some((id) => item.id === `task-${id}`),
    ),
  );
  await workflowAction(p, op, { action: "done", id: mine.id });
  assert.ok(!(await today(op)).some((item) => item.id === `task-${mine.id}`));

  const makeDraft = (kind: string, submittedBy: number) => {
    const identity = randomUUID();
    return p.create({
      collection: "content-drafts",
      data: {
        title: `虚构 ${kind} 审核`,
        locale: "zh",
        kind,
        identity,
        contentKey: identity,
        slug: identity,
        routeKey: identity,
        body: { kind },
        revision: 1,
        reviewState: "review",
        submittedBy,
      },
    });
  };
  const guide = await makeDraft("guide", op.id);
  const self = await makeDraft("guide", reviewer.id);
  const other = await makeDraft("faq", op.id);
  const reviewItems = await today(reviewer);
  assert.ok(reviewItems.some((item) => item.href === `/content-center?id=${guide.id}`));
  for (const id of [self.id, other.id])
    assert.ok(!reviewItems.some((item) => item.id === `content-${id}`));
  assert.ok(!(await today(op)).some((item) => item.id === `content-${guide.id}`));
  const policy = await p.create({
    collection: "policy-groups",
    data: { contentKey: `today-${key}`, revision: 1 },
  });
  const fact = await p.create({
    collection: "policy-fact-drafts",
    data: {
      group: policy.id,
      facts: { countryNameZh: "虚构国家" },
      revision: 1,
      reviewState: "review",
      submittedBy: op.id,
    },
  });
  const note = await p.create({
    collection: "policy-note-drafts",
    data: {
      group: policy.id,
      title: "虚构政策说明",
      slug: key,
      locale: "zh",
      revision: 1,
      reviewState: "review",
      submittedBy: op.id,
      needsReview: true,
    },
  });
  const policyTask = await p.create({
    collection: "workflow-tasks",
    data: {
      key: `policy-note-review:${policy.id}:en:1`,
      policyGroup: policy.id,
      title: "虚构英文说明复核",
      assignee: reviewer.id,
      status: "open",
    },
  });
  const originalFlag = process.env.VISA_CHECKER_ENABLED;
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    const items = await today(reviewer);
    assert.equal(
      items.find((item) => item.id === `fact-${fact.id}`)?.href,
      `/content-center/policy-facts?id=${policy.id}`,
    );
    assert.equal(
      items.find((item) => item.id === `note-${note.id}`)?.href,
      `/content-center/policy-facts?id=${policy.id}&locale=zh`,
    );
    assert.equal(
      items.find((item) => item.id === `task-${policyTask.id}`)?.href,
      `/content-center/policy-facts?id=${policy.id}&locale=en`,
    );
    process.env.VISA_CHECKER_ENABLED = "false";
    assert.ok(
      !(await today(reviewer)).some((item) => item.href.startsWith("/content-center/policy-facts")),
    );
  } finally {
    if (originalFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
    else process.env.VISA_CHECKER_ENABLED = originalFlag;
    await p.delete({ collection: "workflow-tasks", id: policyTask.id });
    await p.delete({ collection: "policy-note-drafts", id: note.id });
    await p.delete({ collection: "policy-fact-drafts", id: fact.id });
    await p.delete({ collection: "policy-groups", id: policy.id });
  }

  await p.updateGlobal({ slug: "public-company-settings", data: { companyName: "虚构待办公司" } });
  const { case: caseID } = await businessAction(p, op, {
    action: "create",
    inquiry: fresh.id,
    title: "虚构今日服务单",
    key: randomUUID(),
  });
  const action = async (actor: Staff, action: string, quote: unknown) =>
    businessAction(p, actor, {
      action,
      id: caseID,
      quote,
      key: randomUUID(),
      revision: (await businessRead(p, actor, caseID)).case.revision,
    });
  await action(op, "quote", {
    title: "虚构今日审核报价",
    scope: "虚构",
    included: "虚构",
    excluded: "虚构",
    terms: "虚构",
    currency: "CNY",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lineFormat: 2,
    lines: [{ label: "虚构陪同", quantity: 1, unitMinor: 100, serviceSource: "company" }],
  });
  const [quote] = (await businessRead(p, op, caseID)).quotes;
  await action(op, "submit-review", quote.id);
  assert.ok(
    (await today(manager)).some(
      (item) => item.href === `/business-center?id=${caseID}#quote-${quote.id}`,
    ),
  );
  for (const actor of [outsider, reviewer, op])
    assert.ok(!(await today(actor)).some((item) => item.id === `quote-${quote.id}`));
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { quoteManagedNotice: "虚构新文案" },
  });
  assert.ok(!(await today(manager)).some((item) => item.id === `quote-${quote.id}`));
  await p.update({
    collection: "inquiries",
    id: due.id,
    user: admin,
    data: { owner: teammate.id },
  });
  assert.ok(!(await today(op)).some((item) => item.id === `inquiry-${due.id}`));
  await p.update({ collection: "staff", id: op.id, user: admin, data: { active: false } });
  await assert.rejects(readStaffToday(p, op, now), { status: 403 });
  console.log("PASS personal today, Beijing cutoff, completion, scoped reviews and revoked access");
} finally {
  await p.updateGlobal({
    slug: "public-company-settings",
    data: {
      companyName: company.companyName ?? null,
      quoteManagedNotice: company.quoteManagedNotice ?? null,
    },
  });
  await p.destroy();
}
process.exit(0);
