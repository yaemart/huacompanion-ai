import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { GET, POST } from "../../src/app/(frontend)/api/performance-incidents/route";
import { performanceRead, performanceAction } from "../../src/server/performance/service";
import { businessAction } from "../../src/server/business/service";
import { mutateContent } from "../../src/server/content/service";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
import { relationID } from "../../src/cms/access";
import { workflowAction, workflowRead } from "../../src/server/workflow/service";
import { appealClosesAt } from "../../src/lib/performance-incidents";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const origin = process.env.APP_URL!;
const endpoint = origin + "/api/performance-incidents";
const oldVisa = process.env.VISA_CHECKER_ENABLED;
process.env.VISA_CHECKER_ENABLED = "true";
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const foreignTeam = await p.create({ collection: "teams", data: { name: "foreign-" + key } });
  const staff = (
    name: string,
    role: "operations" | "manager" | "editor" | "reviewer",
    teamID = team.id,
  ) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name,
        email: `${name}-${key}@example.invalid`,
        password: key,
        role,
        team: teamID,
        contentKinds: ["guide", "immigration-policy"],
      },
    });
  const owner = await staff("performance-owner", "operations");
  const successor = await staff("performance-successor", "operations");
  const manager = await staff("performance-manager", "manager");
  const outsider = await staff("performance-outsider", "manager", foreignTeam.id);
  const editor = await staff("performance-editor", "editor");
  const publisher = await staff("performance-publisher", "reviewer");
  const independent = await staff("performance-independent-reviewer", "reviewer");
  const token = async (email: string) => {
    const result = await p.login({ collection: "staff", data: { email, password: key } });
    return "JWT " + result.token;
  };
  const ownerToken = await token(owner.email);
  const successorToken = await token(successor.email);
  const foreignToken = await token(outsider.email);
  const managerToken = await token(manager.email);
  const send = (authorization: string, command: object, from = origin) =>
    POST(
      new Request(endpoint, {
        method: "POST",
        headers: { origin: from, authorization, "Content-Type": "application/json" },
        body: JSON.stringify(command),
      }),
    );
  const load = (authorization: string, suffix = "") =>
    GET(new Request(endpoint + suffix, { headers: { authorization } }));

  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: key,
      requestKey: key,
      contentHash: key,
      name: "虚构客户",
      email: "performance-customer@example.invalid",
      categories: ["business"],
      city: "Shanghai",
      status: "new",
      team: team.id,
      owner: owner.id,
    },
  });
  const { case: service } = await businessAction(p, owner, {
    action: "create",
    inquiry: inquiry.id,
    title: "虚构服务单",
    key: randomUUID(),
  });
  const occurredAt = new Date().toISOString();
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: manager,
    data: { owner: successor.id },
  });
  const registration = {
    action: "register",
    source: "case",
    sourceRecord: service,
    sourceVersion: service,
    occurredAt,
    title: "费用与约定不符",
    evidence: "INTERNAL-ONLY-FIXTURE 客户原文留在源记录",
  };
  assert.equal((await load("")).status, 403);
  assert.equal((await load(foreignToken, `?source=case&record=${service}`)).status, 404);
  assert.equal((await send(successorToken, registration, "https://example.invalid")).status, 403);
  assert.equal((await send(ownerToken, registration)).status, 404);
  const created = await send(successorToken, registration);
  assert.equal(created.status, 200, await created.clone().text());
  const { id } = await created.json();
  const replay = await send(successorToken, { ...registration, title: "费用，与约定不符。" });
  assert.deepEqual(await replay.json(), { id, duplicate: true });
  assert.equal((await load(foreignToken, `?id=${id}`)).status, 404);
  const before = await performanceRead(p, manager, id);
  assert.ok(before.queue[0].people.some((person) => person.id === owner.id));
  assert.ok(!before.queue[0].people.some((person) => person.id === successor.id));
  assert.equal(before.queue[0].state, "pending");
  assert.equal(
    (await send(successorToken, { action: "supplement", id, evidence: "补充对客报价佐证" })).status,
    200,
  );
  const evidenceRetry = await send(successorToken, {
    action: "supplement",
    id,
    evidence: "补充对客报价佐证",
  });
  assert.deepEqual(await evidenceRetry.json(), { id, duplicate: true });
  const choice = {
    action: "decide",
    id,
    state: "confirmed",
    responsibility: "company",
    redacted: true,
    reason: "核对事发前的报价与服务记录",
    findings: [{ staff: owner.id, duty: "service", summary: "已核对同意的报价，执行费用有差异。" }],
  };
  assert.equal((await send(foreignToken, choice)).status, 404);
  assert.equal(
    (
      await send(managerToken, {
        ...choice,
        findings: [{ ...choice.findings[0], staff: successor.id }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(managerToken, {
        ...choice,
        findings: [{ ...choice.findings[0], summary: "customer@example.invalid" }],
      })
    ).status,
    400,
  );
  const nameLeak = {
    ...choice,
    findings: [{ ...choice.findings[0], summary: "虚构客户要求复核。" }],
  };
  assert.equal((await send(managerToken, nameLeak)).status, 400);
  const decisions = await Promise.all([send(managerToken, choice), send(managerToken, choice)]);
  assert.deepEqual(decisions.map(({ status }) => status).sort(), [200, 409]);
  const decided = decisions.find(({ status }) => status === 200)!;
  assert.equal(decided.status, 200, await decided.clone().text());
  const response = await load(ownerToken, `?id=${id}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const personal = await response.json();
  assert.equal(personal.queue.length, 0);
  assert.equal(personal.personal.length, 1);
  assert.equal(personal.personal[0].state, "pending");
  assert.equal(personal.personal[0].finding.summary, choice.findings[0].summary);
  assert.ok(!JSON.stringify(personal).includes("INTERNAL-ONLY-FIXTURE"));
  assert.ok(
    !JSON.stringify(await (await load(successorToken, `?id=${id}`)).json()).includes(
      choice.findings[0].summary,
    ),
  );
  await assert.rejects(
    p.find({ collection: "performance-incidents", user: admin, overrideAccess: false }),
    { status: 403 },
  );
  const notices = (await workflowRead(p, owner)).notifications.filter(
    (item) => item.performanceIncident === id,
  );
  assert.equal(notices.length, 1);
  assert.ok(!notices[0].inquiry);
  assert.ok(
    !(await workflowRead(p, successor)).notifications.some(
      (item) => item.performanceIncident === id,
    ),
  );
  await assert.rejects(workflowAction(p, successor, { action: "read", id: notices[0].id }));
  await workflowAction(p, owner, { action: "read", id: notices[0].id });

  const reason = "发出报价后客户确认修改了范围，请核对时间。";
  assert.equal((await send(successorToken, { action: "appeal", id, reason })).status, 404);
  assert.equal((await send(ownerToken, { action: "appeal", id, reason })).status, 200);
  assert.equal((await send(ownerToken, { action: "appeal", id, reason })).status, 409);
  const finding = (await performanceRead(p, manager, id)).queue[0].findings[0];
  const conclusion = {
    action: "resolve",
    id,
    finding: finding.id,
    result: "changed",
    redacted: true,
    reason: "确认范围在事发前已变更",
    summary: "原归属已撤销，服务记录保留。",
  };
  assert.equal((await send(managerToken, conclusion)).status, 403);
  await performanceAction(p, admin, conclusion);
  assert.equal((await performanceRead(p, owner, id)).personal[0].finding.active, false);
  assert.equal(
    (await workflowRead(p, owner)).notifications.filter((item) => item.performanceIncident === id)
      .length,
    2,
  );
  const audit = await p.find({
    collection: "audit-events",
    where: { entity: { equals: "performance-incident" }, recordId: { equals: String(id) } },
    pagination: false,
  });
  assert.deepEqual(
    new Set(audit.docs.map(({ action }) => action)),
    new Set(["register", "supplement", "decide", "notify", "appeal", "resolve"]),
  );

  const other = await performanceAction(p, successor, {
    ...registration,
    title: "另一项独立履约问题",
  });
  const duplicate = await performanceAction(p, successor, {
    ...registration,
    title: "另一个渠道报告同一项费用",
  });
  await performanceAction(p, manager, {
    action: "decide",
    id: duplicate.id,
    state: "dismissed",
    reason: "核对两次反馈属于同一费用问题",
    duplicateOf: id,
  });
  assert.equal((await performanceRead(p, manager, duplicate.id)).queue[0].duplicateOf, id);
  await businessAction(p, manager, {
    action: "stage",
    id: service,
    revision: 1,
    stage: "discovery",
    reason: "虚构经理参与",
    key: randomUUID(),
  });
  const conflict = await performanceAction(p, successor, {
    ...registration,
    occurredAt: new Date().toISOString(),
    title: "主管已参与的服务事件",
  });
  assert.equal((await send(managerToken, { ...choice, id: conflict.id })).status, 404);
  await performanceAction(p, admin, { ...choice, id: conflict.id, findings: [] });
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: admin,
    data: { team: foreignTeam.id, owner: null },
  });
  assert.equal((await send(foreignToken, { ...choice, id: other.id })).status, 404);
  await performanceAction(p, admin, {
    ...choice,
    id: other.id,
    responsibility: "supplier",
    findings: [],
  });
  assert.equal(
    (
      await p.count({
        collection: "performance-findings",
        where: { incident: { equals: other.id } },
      })
    ).totalDocs,
    0,
  );

  const body = {
    kind: "guide",
    locale: "zh",
    contentKey: "performance-" + key,
    slug: "performance-" + key,
    title: "虚构指南",
    blocks: [{ type: "paragraph", text: "仅在测试使用" }],
    sources: [{ id: "source", title: "虚构来源", url: "https://example.invalid" }],
  };
  let draft = await mutateContent(p, editor, { action: "save", body });
  draft = await mutateContent(p, editor, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  await mutateContent(p, publisher, { action: "publish", id: draft.id, revision: draft.revision });
  const published = (
    await p.find({
      collection: "content-events",
      where: { draftId: { equals: draft.id }, action: { equals: "publish" } },
      depth: 0,
    })
  ).docs[0];
  assert.deepEqual(published.publicationParticipants, {
    editing: [editor.id],
    review: [publisher.id],
    verification: [],
  });
  const correction = await performanceAction(p, publisher, {
    action: "register",
    source: "content",
    sourceRecord: draft.id,
    sourceVersion: published.id,
    title: "虚构价格有误",
    evidence: "已发布版本与当时有效的报价记录不同。",
  });
  const confirmCorrection = {
    ...choice,
    id: correction.id,
    findings: [
      { staff: editor.id, duty: "editing", summary: "原公开价格有误。" },
      { staff: publisher.id, duty: "review", summary: "审核时遗漏了已有价格依据。" },
    ],
  };
  await assert.rejects(performanceAction(p, publisher, confirmCorrection), { status: 404 });
  await assert.rejects(
    performanceAction(p, admin, {
      ...confirmCorrection,
      findings: [{ staff: publisher.id, duty: "editing", summary: "错用职责" }],
    }),
    { status: 400 },
  );
  await performanceAction(p, admin, confirmCorrection);
  const findings = (await performanceRead(p, admin, correction.id)).queue[0].findings;
  assert.equal(findings.length, 2);
  await assert.rejects(
    performanceAction(
      p,
      editor,
      { action: "appeal", id: correction.id, reason },
      Date.parse(findings[0].appealClosesAt),
    ),
    { status: 409 },
  );
  assert.equal((await performanceRead(p, editor, correction.id)).personal.length, 1);

  await performanceAction(p, editor, {
    action: "appeal",
    id: correction.id,
    reason: "请求核对第一次发布。",
  });
  const editorFinding = findings.find((item) => item.staff === editor.id)!;
  const publisherFinding = findings.find((item) => item.staff === publisher.id)!;
  const uphold = "维持这位编辑的判定。";
  await performanceAction(p, independent, {
    action: "resolve",
    id: correction.id,
    finding: editorFinding.id,
    result: "upheld",
    redacted: true,
    reason: "核对原稿",
    summary: uphold,
  });
  await performanceAction(p, publisher, {
    action: "appeal",
    id: correction.id,
    reason: "请求核对原始正式记录。",
  });
  assert.equal((await performanceRead(p, editor, correction.id)).personal[0].state, "confirmed");
  const privatePublisherText = "给原审核人的单独结论。";
  await performanceAction(p, independent, {
    action: "resolve",
    id: correction.id,
    finding: publisherFinding.id,
    result: "dismissed",
    redacted: true,
    reason: "新证据证明这个事件不成立",
    summary: privatePublisherText,
  });
  const former = (await performanceRead(p, editor, correction.id)).personal[0].finding;
  assert.equal(former.active, false);
  assert.equal(former.resolution, uphold);
  assert.equal(former.result, "upheld");
  assert.ok(!JSON.stringify(former).includes(privatePublisherText));
  const organized = await performanceAction(p, editor, {
    action: "register",
    source: "content",
    sourceRecord: draft.id,
    sourceVersion: published.id,
    title: "另一个流程错误",
    evidence: "内部依据",
  });
  await performanceAction(p, admin, { ...choice, id: organized.id, findings: [] });
  const publishedByMe = await performanceRead(p, publisher, organized.id);
  assert.equal(publishedByMe.reviewed.length, 1);
  assert.equal(publishedByMe.personal.length, 0);
  assert.ok(!JSON.stringify(publishedByMe).includes("内部依据"));

  const fact = await mutateSharedPolicyFacts(p, editor, {
    action: "save",
    contentKey: "performance-fact-" + key,
    facts: {
      countryCode: "XY",
      countryNameZh: "虚构政策",
      countryNameEn: "Fictional policy",
      policyType: "other",
      maximumStay: 3,
      stayUnit: "days",
      validFrom: "2026-01-01",
      officialSourceUrl: "https://example.invalid",
      lastVerifiedOn: "2026-01-01",
      verifiedBy: editor.id,
      portsAndRegions: [],
    },
  });
  const group = relationID(fact.group)!;
  const submitted = await mutateSharedPolicyFacts(p, editor, {
    action: "submit",
    groupId: group,
    revision: fact.revision,
  });
  await mutateSharedPolicyFacts(p, publisher, {
    action: "publish",
    groupId: group,
    revision: submitted.revision,
    policyReviewed: true,
  });
  const version = relationID(
    (await p.findByID({ collection: "policy-groups", id: group, depth: 0 })).activeFactVersion,
  )!;
  const report = {
    action: "register",
    source: "fact",
    sourceRecord: group,
    sourceVersion: version,
    issueField: "stay",
    title: "停留时长录入有误",
    evidence: "中英文共用版本的时长与虚构来源不符。",
  };
  const facts = await performanceAction(p, editor, report);
  const repeated = await performanceAction(p, editor, {
    ...report,
    locale: "en",
    title: "停留时长录入有误。",
  });
  assert.deepEqual(repeated, { id: facts.id, duplicate: true });
  for (let i = 0; i < 101; i++) {
    await p.create({
      collection: "performance-incidents",
      data: {
        key: `${key}-outside-${i}`,
        source: "case",
        sourceRecord: service!,
        sourceVersion: service!,
        title: "权限外的虚构记录",
        evidence: "OTHER-SCOPE-FIXTURE",
        occurredAt,
        reportedBy: successor.id,
        participants: { service: [owner.id] },
        sourceTeam: foreignTeam.id,
        completeHistory: true,
        state: "pending",
      },
    });
  }
  const visibleAfterNoise = await performanceRead(p, independent);
  assert.ok(visibleAfterNoise.queue.some((item) => item.id === organized.id));
  assert.ok(!JSON.stringify(visibleAfterNoise).includes("OTHER-SCOPE-FIXTURE"));
  assert.ok(Date.parse(appealClosesAt(occurredAt)) > Date.parse(occurredAt));
  console.log(
    "PASS reports, immutable evidence, dated attribution, team/reviewer scope, redacted notices, one appeal, audit and shared policy dedupe",
  );
} finally {
  if (oldVisa === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = oldVisa;
  await p.destroy();
}
process.exit(0);
