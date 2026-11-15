import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { defaultScorecardRules } from "../../src/lib/staff-scorecard";
import {
  changeScorecardSettings,
  readScorecardSettings,
} from "../../src/server/performance/scorecard-settings";
import { readMonthlyPerformance } from "../../src/server/performance/monthly";
import { businessAction } from "../../src/server/business/service";
import { performanceAction } from "../../src/server/performance/service";
import { POST } from "../../src/app/(frontend)/api/scorecard-settings/route";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const now = Date.parse("2032-11-30T15:59:59.999Z"); // Beijing: November 30.
const dec = Date.parse("2032-12-31T15:58:00Z");
const jan = Date.parse("2033-01-02T00:00:00Z");
const march = Date.parse("2033-03-01T00:00:00Z");
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { role: { equals: "admin" }, active: { not_equals: false } },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const person = (role: "operations" | "manager" | "editor", label: string) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        role,
        team: team.id,
        name: label + key,
        email: label + key + "@example.invalid",
        password: key,
      },
    });
  const owner = await person("operations", "trial-ops");
  const manager = await person("manager", "trial-manager");
  const mixed = await person("operations", "trial-combined");
  const editor = await person("editor", "trial-editor");

  const rules = defaultScorecardRules();
  rules.trialStart = "2032-12";
  rules.assignments[String(owner.id)] = "operations";
  rules.assignments[String(mixed.id)] = "combined";
  rules.assignments[String(editor.id)] = "editor";
  rules.templates.combined.quality.weight = 65;
  rules.templates.combined.response.weight = 35;
  const save = { action: "save", revision: 0, rules, reason: "设定虚构测试规则" };
  await assert.rejects(readScorecardSettings(p, owner), /管理员/);
  await assert.rejects(changeScorecardSettings(p, manager, save, now), /管理员/);
  await assert.rejects(
    p.find({ collection: "scorecard-plans", user: admin, overrideAccess: false }),
    { status: 403 },
  );
  const origin = process.env.APP_URL!;
  const token = (
    await p.login({ collection: "staff", data: { email: owner.email, password: key } })
  ).token;
  const request = (authorization: string, from = origin) =>
    new Request(origin + "/api/scorecard-settings", {
      method: "POST",
      headers: { authorization, origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(save),
    });
  assert.equal((await POST(request(""))).status, 403);
  assert.equal((await POST(request("JWT " + token))).status, 403);
  assert.equal((await POST(request("JWT " + token, "https://example.invalid"))).status, 403);
  await assert.rejects(
    changeScorecardSettings(p, admin, { ...save, formal: true }, now),
    /请选择|格式/,
  );
  assert.equal((await changeScorecardSettings(p, admin, save, now)).revision, 1);
  await assert.rejects(changeScorecardSettings(p, admin, save, now), /已更新/);
  const schedule = { action: "schedule", revision: 1, month: "2032-12", reason: "安排虚构试行" };
  await assert.rejects(
    changeScorecardSettings(p, admin, { ...schedule, month: "2032-11" }, now),
    /未来/,
  );
  await assert.rejects(
    changeScorecardSettings(p, admin, { ...schedule, month: "2033-01" }, now),
    /试行开始月/,
  );
  await changeScorecardSettings(p, admin, schedule, now);
  await assert.rejects(changeScorecardSettings(p, admin, schedule, jan), /未来/);

  const read = (staff = owner, at = dec) =>
    readMonthlyPerformance(p, staff, { month: "2032-12" }, at);
  assert.equal((await read()).scorecard?.mode, "trial");
  assert.equal(
    (await read()).scorecard?.metrics?.find(({ key }) => key === "complaints")?.status,
    "insufficient",
  );
  await assert.rejects(
    readMonthlyPerformance(p, manager, { staff: String(owner.id) }, dec),
    /只能查看本人/,
  );
  const adminReport = await readMonthlyPerformance(
    p,
    admin,
    { month: "2032-12", staff: String(owner.id) },
    dec,
  );
  assert.deepEqual(adminReport.scorecard, (await read()).scorecard);
  assert.equal((await read(manager)).scorecard?.metrics, undefined);
  assert.equal(
    (await readMonthlyPerformance(p, owner, { month: "2033-03" }, march)).scorecard?.mode,
    "recording",
  );

  // The December conclusion is still owned by its December rules when January settings change.
  const nextRules = structuredClone(rules);
  nextRules.templates.operations.followup.target = 92;
  await changeScorecardSettings(p, admin, { ...save, revision: 1, rules: nextRules }, dec);
  await changeScorecardSettings(p, admin, { ...schedule, revision: 2, month: "2033-01" }, dec);
  const row = (await read(owner, jan)).scorecard?.metrics?.find(({ key }) => key === "followup");
  assert.equal(row?.rule.target, 90);
  assert.equal(
    (await readMonthlyPerformance(p, owner, { month: "2033-01" }, jan)).scorecard?.metrics?.find(
      ({ key }) => key === "followup",
    )?.rule.target,
    92,
  );

  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: key,
      requestKey: key,
      contentHash: key,
      email: key + "@example.invalid",
      name: "虚构评分客户",
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: owner.id,
    },
  });
  const { case: service } = await businessAction(p, owner, {
    action: "create",
    inquiry: inquiry.id,
    title: "虚构试行服务单",
    key: randomUUID(),
  });
  const evidence = "INTERNAL-SCORECARD-" + key;
  const regTime = dec - 1000;
  const register = {
    action: "register",
    source: "case",
    sourceRecord: service,
    sourceVersion: service,
    occurredAt: new Date(regTime - 1000).toISOString(),
    title: "虚构费用偏差",
    evidence,
  };
  const { id } = await performanceAction(p, owner, register, regTime);
  await p.db.pool.query("UPDATE performance_incidents SET created_at=$2 WHERE id=$1", [
    id,
    new Date(regTime),
  ]);
  assert.equal((await read()).pending.find((pending) => pending.id === id)?.reason, "confirmation");
  const statusOf = (report: Awaited<ReturnType<typeof read>>) =>
    report.scorecard?.metrics?.find(({ key }) => key === "complaints");
  assert.equal(statusOf(await read())?.status, "insufficient");

  const choice = {
    action: "decide",
    id,
    state: "confirmed",
    responsibility: "company",
    redacted: true,
    reason: evidence,
    findings: [{ staff: owner.id, duty: "service", summary: "核对约定及费用" }],
  };
  await performanceAction(p, manager, choice, dec);
  const window = await read(owner, dec + 1000);
  assert.equal(window.pending[0].reason, "window");
  assert.equal(statusOf(window)?.status, "pending");
  assert.equal(window.scorecard?.coverage?.waiting, true);
  assert.equal(window.incidents.complaints, 0);
  await performanceAction(p, owner, { action: "appeal", id, reason: "请复核虚构约定" }, jan);
  const reviewing = await read(owner, jan);
  assert.equal(reviewing.pending[0].reason, "review");
  assert.equal(statusOf(reviewing)?.status, "pending");
  const finding = (
    await p.find({ collection: "performance-findings", where: { incident: { equals: id } } })
  ).docs[0];
  const resolve = {
    action: "resolve",
    id,
    finding: finding.id,
    result: "upheld",
    redacted: true,
    reason: evidence,
    summary: "复核后维持原归属",
  };
  await assert.rejects(performanceAction(p, manager, resolve, jan + 500), /权限|不能/);
  await performanceAction(p, admin, resolve, jan + 1000);
  const settled = await read(owner, jan + 2000);
  assert.equal(settled.incidents.complaints, 1);
  assert.equal(statusOf(settled)?.value, 1);
  assert.equal(statusOf(settled)?.status, "eligible");
  assert.equal(settled.scorecard?.version, "1");
  assert.deepEqual(settled.scorecard?.corrections, [
    { id, at: new Date(jan + 1000).toISOString(), result: "upheld" },
  ]);
  assert.equal(
    (await readMonthlyPerformance(p, owner, { month: "2033-01" }, jan + 2000)).incidents.complaints,
    0,
  );
  assert.doesNotMatch(JSON.stringify(settled.scorecard), /"score"|"points"|INTERNAL-SCORECARD/);
  assert.equal((await read(manager, jan + 2000)).scorecard?.corrections, undefined);

  const stored = p.db.pool;
  const addLinked = async (
    kind: "case" | "note" | "fact",
    at: string,
    related: number | null,
    who = mixed.id,
  ) => {
    const saved = await stored.query<{ id: number }>(
      `INSERT INTO performance_incidents
        (key, source, state, responsibility, source_record, source_version, title, evidence, occurred_at,
         reported_by, participants, first_confirmed_at, related_incident)
       VALUES ($1, $2, 'confirmed', 'company', 1, 1, $3, $3, $4, $5, '{}', $4, $6) RETURNING id`,
      [key + kind, kind, evidence, at, mixed.id, related],
    );
    const incident = saved.rows[0].id;
    await stored.query(
      `INSERT INTO performance_findings (incident_id, staff_id, duty, summary, notified_at)
       VALUES ($1, $2, 'service', $3, $4)`,
      [incident, who, evidence, at],
    );
    return incident;
  };
  const linked = await addLinked("case", "2032-12-30T15:00:00.000Z", null);
  const bridge = await addLinked("fact", "2032-12-31T02:00:00.000Z", linked, editor.id);
  await addLinked("note", "2033-01-01T01:00:00.000Z", bridge);
  const mixedQuality = (report: Awaited<ReturnType<typeof read>>) =>
    report.scorecard?.metrics?.find(({ key }) => key === "quality");
  assert.equal(mixedQuality(await read(mixed, jan))?.status, "pending");
  const oneSettled = Date.parse("2033-01-07T00:00:00Z");
  assert.equal(mixedQuality(await read(mixed, oneSettled))?.value, 1);
  const pendingJanuary = await readMonthlyPerformance(p, mixed, { month: "2033-01" }, oneSettled);
  assert.equal(mixedQuality(pendingJanuary)?.status, "pending");
  assert.equal(mixedQuality(pendingJanuary)?.value, 0);
  const afterBoth = Date.parse("2033-01-14T00:00:00Z");
  assert.equal(mixedQuality(await read(mixed, afterBoth))?.value, 1);
  const mixedJanuary = await readMonthlyPerformance(p, mixed, { month: "2033-01" }, afterBoth);
  assert.equal(mixedJanuary.incidents.corrections, 1);
  assert.equal(mixedQuality(mixedJanuary)?.value, 0);
  assert.doesNotMatch(JSON.stringify(mixedJanuary.scorecard), new RegExp(evidence));

  await stored.query(
    "UPDATE performance_findings SET appeal_at=$2 WHERE incident_id=$1 AND staff_id=$3",
    [linked, new Date(jan), mixed.id],
  );
  assert.equal(mixedQuality(await read(mixed, afterBoth))?.status, "pending");
  assert.equal(
    mixedQuality(await readMonthlyPerformance(p, mixed, { month: "2033-01" }, afterBoth))?.value,
    1,
  );

  await stored.query(
    `INSERT INTO workflow_tasks (key, title, status, assignee_id, due_at, history, created_at)
     VALUES ($1, $2, 'done', $3, '2032-12-29T10:00:00Z', $4, '2032-12-01T00:00:00Z')`,
    [
      "quality:" + key,
      evidence,
      editor.id,
      JSON.stringify([{ action: "system-close", at: "2032-12-28T00:00:00Z" }]),
    ],
  );
  const overdue = (await read(editor, afterBoth)).scorecard?.metrics?.find(
    ({ key }) => key === "overdue",
  );
  assert.equal(overdue?.samples, 0);
  assert.equal(overdue?.status, "unassigned");

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
  for (const number of [1, 2]) {
    const reply = await p.create({
      collection: "support-messages",
      data: {
        conversation: conversation.id,
        dedupe: key + number,
        author: "staff",
        staff: owner.id,
        visibility: "public",
        text: evidence,
      },
    });
    await stored.query("UPDATE support_messages SET created_at=$2 WHERE id=$1", [
      reply.id,
      "2032-12-20T00:00:00Z",
    ]);
  }
  assert.equal(statusOf(await read(owner, afterBoth))?.samples, 1);

  const rulesChanged = await p.find({
    collection: "audit-events",
    where: { entity: { equals: "scorecard-plan" } },
    pagination: false,
  });
  assert.equal(rulesChanged.docs.filter(({ action }) => action === "schedule").length, 2);
  assert.ok(rulesChanged.docs.some(({ action, before }) => action === "save" && before));

  console.log(
    "PASS rule permissions and history, trial calendar, pending observations, cross-month resolution and linked dedupe",
  );
} finally {
  await p.destroy();
}
process.exit(0);
