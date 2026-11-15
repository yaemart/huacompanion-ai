import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { readMonthlyPerformance } from "../../src/server/performance/monthly";
import { MonthlyPerformance } from "../../src/components/performance/MonthlyPerformance";
import { mutateContent } from "../../src/server/content/service";
import { businessAction } from "../../src/server/business/service";
import { appendIntakeFollowup } from "../../src/server/intake-followups";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const sql = p.db.pool.query.bind(p.db.pool);
const key = randomUUID();
const feb = { month: "2031-02" };
const march = { month: "2031-03" };
const monthStart = "2031-01-31T16:00:00.000Z";
const nextMonth = "2031-02-28T16:00:00.000Z";
const now = Date.parse("2031-03-12T08:00:00.000Z");
const justAfterConfirmation = Date.parse(nextMonth) + 1000;
const secret = "SENSITIVE-FIXTURE-" + key;
try {
  const admin = (
    await p.find({
      collection: "staff",
      depth: 0,
      where: { role: { equals: "admin" }, active: { not_equals: false } },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const staff = (
    name: string,
    role: "operations" | "manager" | "editor" | "reviewer",
    active = true,
  ) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name: name + key,
        email: name + key + "@example.invalid",
        password: key,
        role,
        team: team.id,
        active,
        contentKinds: ["guide"],
      },
    });
  const owner = await staff("monthly-owner-", "operations");
  const other = await staff("monthly-other-", "operations");
  const manager = await staff("monthly-manager-", "manager");
  const editor = await staff("monthly-editor-", "editor");
  const reviewer = await staff("monthly-reviewer-", "reviewer");
  const inactive = await staff("monthly-inactive-", "operations", false);
  const read = (person = owner, query: { month: string; staff?: string } = feb, time = now) =>
    readMonthlyPerformance(p, person, query, time);

  await assert.rejects(read(owner, { ...feb, staff: String(manager.id) }), /只能查看本人/);
  await assert.rejects(read(manager, { ...feb, staff: String(owner.id) }), /只能查看本人/);
  await assert.rejects(read(inactive), /员工账号登录/);
  await assert.rejects(read(admin, { ...feb, staff: "99999999" }), /没有找到该员工/);
  await assert.rejects(read(admin, { ...feb, staff: "1e0" }), /请选择有效的员工/);
  await assert.rejects(read(owner, { month: "2031-04" }), /有效月份/);
  assert.equal((await read(admin, { ...feb, staff: String(inactive.id) })).name, inactive.name);

  async function incident(
    name: string,
    source: "case" | "content" | "fact" | "note",
    state: "pending" | "confirmed" | "dismissed",
    confirmed: string | null,
    responsibility = "company",
    reportedBy: number = owner.id,
    duplicateOf?: number,
  ) {
    const result = await sql<{ id: number }>(
      `INSERT INTO performance_incidents
        (key, source, state, source_record, source_version, title, evidence, occurred_at,
         reported_by, participants, responsibility, first_confirmed_at, created_at, duplicate_of)
        VALUES ($1, $2, $3, 1, 1, $4, $4, $5, $6, '{}', $7, $8, $5, $9) RETURNING id`,
      [
        key + name,
        source,
        state,
        secret,
        monthStart,
        reportedBy,
        responsibility,
        confirmed,
        duplicateOf,
      ],
    );
    return result.rows[0].id;
  }
  const finding = (id: number, who: number, notifiedAt: string, appealAt?: string) =>
    sql(
      `INSERT INTO performance_findings (incident_id, staff_id, duty, summary, notified_at, appeal_at)
        VALUES ($1, $2, 'service', $3, $4, $5)`,
      [id, who, secret, notifiedAt, appealAt],
    );
  const confirmation = await incident("pending", "case", "pending", null);
  const teamPending = await incident("team", "note", "pending", null, "unassigned", manager.id);
  const oldConfirmation = "2031-02-28T15:59:59.999Z";
  const contested = await incident("contested", "fact", "confirmed", oldConfirmation);
  await finding(contested, owner.id, oldConfirmation);
  await finding(contested, editor.id, oldConfirmation, "2031-03-02T00:00:00.000Z");
  const marched = await incident("march", "case", "confirmed", nextMonth);
  await finding(marched, owner.id, nextMonth);
  await incident("supplier", "case", "confirmed", monthStart, "supplier");
  await incident(
    "duplicate",
    "case",
    "dismissed",
    monthStart,
    "unassigned",
    owner.id,
    confirmation,
  );

  const early = await read(owner, feb, justAfterConfirmation);
  assert.deepEqual(
    early.pending.map(({ id, reason }) => [id, reason]),
    [
      [contested, "window"],
      [confirmation, "confirmation"],
    ],
  );
  const ownerFeb = await read();
  assert.deepEqual(ownerFeb.incidents, { complaints: 0, corrections: 1 });
  assert.deepEqual(
    ownerFeb.pending.map(({ id }) => id),
    [confirmation],
  );
  assert.equal(ownerFeb.people, undefined);
  assert.equal((await read(manager)).pending[0].id, teamPending);
  assert.equal((await read(owner, march)).incidents.complaints, 1);
  const entire = await read(admin);
  assert.deepEqual(entire.incidents, { complaints: 1, corrections: 0 });
  assert.equal(entire.pending.find(({ id }) => id === contested)?.reason, "review");
  assert.ok(entire.people?.some(({ id, active }) => id === inactive.id && active === false));
  assert.deepEqual(
    (await read(admin, { ...feb, staff: String(owner.id) })).incidents,
    ownerFeb.incidents,
  );
  assert.doesNotMatch(JSON.stringify(entire), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(ownerFeb), new RegExp(manager.name));

  await sql(
    `UPDATE performance_findings SET resolved_at=$3, result='upheld' WHERE incident_id=$1 AND staff_id=$2`,
    [contested, editor.id, "2031-03-03T04:00:00.000Z"],
  );
  assert.equal((await read(admin)).incidents.corrections, 1);
  assert.equal((await read(editor)).incidents.corrections, 1);
  assert.equal((await read(editor, march)).incidents.corrections, 0);
  await sql(
    `UPDATE performance_findings SET active=false, result='changed' WHERE incident_id=$1 AND staff_id=$2`,
    [contested, editor.id],
  );
  assert.equal((await read(editor)).incidents.corrections, 0);

  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: key,
      requestKey: key,
      contentHash: key,
      name: secret,
      email: key + "@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      team: team.id,
      owner: other.id,
    },
  });
  await sql("UPDATE inquiries SET created_at=$2 WHERE id=$1", [inquiry.id, "2031-01-31T15:45:00Z"]);
  const conversation = await p.create({
    collection: "support-conversations",
    data: {
      visitorHash: key,
      startKey: key,
      locale: "zh",
      mode: "human",
      status: "open",
      aiRevision: 1,
      revision: 1,
      inquiryLinks: [{ reference: inquiry.reference }],
    },
  });
  async function message(
    label: string,
    who: number,
    at: string,
    visibility: "public" | "internal" = "public",
  ) {
    const msg = await p.create({
      collection: "support-messages",
      data: {
        conversation: conversation.id,
        dedupe: key + label,
        author: "staff",
        staff: who,
        visibility,
        text: secret,
      },
    });
    await sql("UPDATE support_messages SET created_at=$2 WHERE id=$1", [msg.id, at]);
  }
  await message("internal", manager.id, "2031-01-31T15:50:00Z", "internal");
  await message("first", owner.id, monthStart);
  await message("later", manager.id, "2031-02-01T00:00:00Z");
  assert.deepEqual((await read()).response, { samples: 1, minutes: 15 });
  assert.deepEqual((await read(manager)).response, { samples: 0, minutes: null });

  const secondInquiry = await p.create({
    collection: "inquiries",
    data: {
      reference: key + "-second",
      requestKey: key + "-second",
      contentHash: key + "-second",
      name: secret,
      email: key + "@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
    },
  });
  await sql("UPDATE inquiries SET created_at=$2 WHERE id=$1", [
    secondInquiry.id,
    "2031-01-31T15:55:00Z",
  ]);
  await p.update({
    collection: "support-conversations",
    id: conversation.id,
    data: {
      inquiryLinks: [{ reference: inquiry.reference }, { reference: secondInquiry.reference }],
    },
  });
  assert.deepEqual((await read()).response, { samples: 0, minutes: null });

  const { case: service } = await businessAction(p, other, {
    action: "create",
    inquiry: inquiry.id,
    title: "虚构报价响应",
    key: randomUUID(),
  });
  const quote = await p.create({
    collection: "service-quotes",
    data: {
      serviceCase: service,
      createdBy: other.id,
      dedupe: key,
      revision: 1,
      status: "sent",
      title: secret,
      scope: "scope",
      included: "included",
      excluded: "excluded",
      terms: "terms",
      currency: "CNY",
      lines: [],
      totalMinor: 100,
      expiresAt: "2031-02-20T00:00:00.000Z",
      sentAt: "2031-01-31T15:55:00.000Z",
    },
  });
  await p.create({
    collection: "service-events",
    data: {
      serviceCase: service,
      action: "send",
      dedupe: key,
      actor: other.id,
      detail: { quote: quote.id },
    },
  });
  assert.deepEqual((await read()).response, { samples: 0, minutes: null });
  assert.deepEqual((await read(other, { month: "2031-01" })).response, { samples: 1, minutes: 10 });

  const stampInquiryAudit = (at: string) =>
    sql(
      `UPDATE audit_events SET created_at=$2 WHERE id=(
        SELECT id FROM audit_events WHERE entity='inquiries' AND record_id=$1 ORDER BY id DESC LIMIT 1
      )`,
      [String(inquiry.id), at],
    );
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: admin,
    data: { owner: owner.id },
  });
  const schedule = async (due: string, at: string) => {
    await p.update({
      collection: "inquiries",
      id: inquiry.id,
      user: owner,
      data: { nextFollowUp: due },
    });
    await stampInquiryAudit(at);
  };
  await schedule("2031-02-02T00:00:00Z", "2031-02-01T00:00:00Z");
  await schedule("2031-02-03T00:00:00Z", "2031-02-01T12:00:00Z");
  await appendIntakeFollowup(p, owner, {
    kind: "inquiries",
    id: inquiry.id,
    key: randomUUID(),
    body: secret,
  });
  await stampInquiryAudit("2031-02-02T23:00:00Z");
  await schedule("2031-02-04T00:00:00Z", "2031-02-03T09:00:00Z");
  await appendIntakeFollowup(p, owner, {
    kind: "inquiries",
    id: inquiry.id,
    key: randomUUID(),
    body: secret,
  });
  await stampInquiryAudit("2031-02-05T00:00:00Z");

  const taskKey = `quality:${key}`;
  const due = "2031-02-10T00:00:00Z";
  await sql(
    `INSERT INTO workflow_events (key, type, title, recipient_id, due_at)
     VALUES ($1, 'quality-due', $2, $3, $4)`,
    [taskKey, secret, owner.id, due],
  );
  await sql(
    `INSERT INTO workflow_tasks (key, title, status, assignee_id, due_at, history, created_at)
     VALUES ($1, $2, 'done', $3, $4, $5, $6)`,
    [
      taskKey,
      secret,
      owner.id,
      due,
      JSON.stringify([{ action: "done", at: "2031-03-03T05:00:00Z" }]),
      monthStart,
    ],
  );
  const followup = await read();
  assert.deepEqual(followup.followup, { onTime: 1, due: 2 });
  assert.equal(followup.overdueReviews, 1);
  assert.equal((await read(owner, march)).overdueReviews, 0);
  assert.deepEqual((await read(manager)).followup, { onTime: 0, due: 0 });

  const contentKey = "monthly-" + key;
  const body = {
    kind: "guide",
    locale: "zh",
    slug: contentKey,
    contentKey,
    title: secret,
    summary: "验收摘要",
    blocks: [{ type: "paragraph", text: "仅测试内容" }],
    sources: [{ id: "source", title: "虚构来源", url: "https://example.invalid" }],
  };
  let draft = await mutateContent(p, editor, { action: "save", body });
  draft = await mutateContent(p, editor, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  draft = await mutateContent(p, reviewer, {
    action: "publish",
    id: draft.id,
    revision: draft.revision,
  });
  draft = await mutateContent(p, editor, {
    action: "save",
    id: draft.id,
    revision: draft.revision,
    body,
  });
  draft = await mutateContent(p, editor, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  const submittedRevision = draft.revision;
  draft = await mutateContent(p, reviewer, {
    action: "unpublish",
    id: draft.id,
    revision: draft.revision,
  });
  assert.ok(draft.revision > submittedRevision);
  await mutateContent(p, reviewer, {
    action: "return",
    id: draft.id,
    revision: draft.revision,
    note: "请补充资料",
  });
  const events = await sql<{ id: number; action: string }>(
    "SELECT id, action FROM content_events WHERE draft_id = $1 ORDER BY id",
    [draft.id],
  );
  assert.deepEqual(
    events.rows.map(({ action }) => action),
    ["submit", "publish", "submit", "unpublish", "return"],
  );
  const eventTimes = [
    "2031-02-02T03:30:00Z",
    "2031-02-02T04:00:00Z",
    "2031-02-03T03:00:00Z",
    "2031-02-03T03:30:00Z",
    "2031-02-03T04:00:00Z",
  ];
  for (const [index, event] of events.rows.entries())
    await sql("UPDATE content_events SET created_at=$2 WHERE id=$1", [event.id, eventTimes[index]]);
  await sql(
    `INSERT INTO content_events (draft_id, action, actor, revision, created_at)
     VALUES ($1, 'publish', $2, 99, '2031-02-04T04:00:00Z')`,
    [draft.id, reviewer.id],
  );
  assert.deepEqual((await read(reviewer)).review, {
    decisions: 3,
    returned: 1,
    samples: 2,
    minutes: 45,
  });
  const rendered = renderToStaticMarkup(
    createElement(MonthlyPerformance, { report: await read() }),
  );
  assert.match(rendered, /个人业绩与月报/);
  assert.match(rendered, /待定（待确认）/);
  assert.match(rendered, /50%/);
  assert.match(rendered, /缺少计划数据/);
  assert.doesNotMatch(rendered, /name="staff"/);
  assert.doesNotMatch(rendered, new RegExp(secret));
  const adminHtml = renderToStaticMarkup(
    createElement(MonthlyPerformance, { report: await read(admin) }),
  );
  assert.match(adminHtml, /全部员工/);
  assert.match(adminHtml, /已停用/);
  console.log(
    "PASS Beijing month and live appeal corrections, scoped projections, task history, response and review metrics",
  );
} finally {
  await p.destroy();
}
process.exit(0);
