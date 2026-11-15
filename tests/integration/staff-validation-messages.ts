import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { POST as business } from "../../src/app/(frontend)/api/business/route";
import { POST as content } from "../../src/app/(frontend)/api/content-center/route";
import { POST as policy } from "../../src/app/(frontend)/api/content-center/policy-facts/route";
import { checkOrigin, failure, limitedJSON } from "../../src/server/content/auth";

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
const previousVisa = process.env.VISA_CHECKER_ENABLED;
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
  const staff = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: "虚构反馈测试",
      email: `${key}@example.invalid`,
      password: key,
      role: "operations",
      additionalRoles: ["editor"],
      team: team.id,
      contentKinds: ["guide", "immigration-policy"],
    },
  });
  const login = await p.login({ collection: "staff", data: { email: staff.email, password: key } });
  const request = (body: unknown, authorization = `JWT ${login.token}`) =>
    new Request(origin + "/api", {
      method: "POST",
      headers: { origin, authorization, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  async function error(response: Response, pattern: RegExp, status = 400) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match((await response.json()).error, pattern);
  }
  await error(
    failure(Error("SELECT secret_column FROM private_table")),
    /^操作未完成.*保留当前填写/,
  );
  const broken = new Request(origin + "/api", { method: "POST", body: "{broken" });
  await assert.rejects(limitedJSON(broken), /无法读取填写内容.*重新打开表单/);
  assert.throws(() => checkOrigin(broken), {
    status: 403,
    message: /从华伴网站重新打开刚才的页面/,
  });

  const guide = {
    kind: "guide",
    title: "虚构校验指南",
    locale: "zh",
    contentKey: `validation-${key}`,
    slug: `validation-${key}`,
    sourceTopic: "policy",
    blocks: [{ type: "paragraph", text: "仅供演示" }],
    sources: [
      { id: "one", title: "来源一", url: "https://example.invalid/first", checkedAt: "2026-01-01" },
      { id: "two", title: "来源二", url: "example.invalid/second" },
    ],
  };
  await error(
    await content(request({ action: "save", body: { ...guide, title: "", slug: "" } })),
    /标题.*保存草稿/,
  );
  await error(
    await content(request({ action: "save", body: guide })),
    /资料来源.*第 2 条.*来源网址.*https/,
  );
  assert.equal(
    (
      await p.count({
        collection: "content-drafts",
        where: { contentKey: { equals: guide.contentKey } },
      })
    ).totalDocs,
    0,
  );
  guide.sources[1].url = "https://example.invalid/second";
  const savedGuide = await content(request({ action: "save", body: guide }));
  assert.equal(savedGuide.status, 200);
  const draft = await savedGuide.json();
  await error(
    await content(request({ action: "submit", id: draft.id, revision: draft.revision })),
    /资料来源.*第 2 条来源的人工核实日期/,
  );

  const facts = {
    countryCode: "XY",
    countryNameEn: "Fictional country",
    countryNameZh: "虚构国家",
    policyType: "transit-240h",
    maximumStay: 240,
    stayUnit: "hours",
    portsAndRegions: [],
    validFrom: "2026-01-01",
    lastVerifiedOn: "2026-01-01",
    verifiedBy: staff.id,
    officialSourceUrl: "https://example.invalid/policy",
  };
  const savedPolicy = await policy(
    request({ action: "save", contentKey: `validation-${key}`, facts }),
  );
  assert.equal(savedPolicy.status, 200);
  const { groupId } = await savedPolicy.json();
  const findDraft = async () =>
    (await p.find({ collection: "policy-fact-drafts", where: { group: { equals: groupId } } }))
      .docs[0];
  const first = await findDraft();
  await error(
    await policy(request({ action: "submit", groupId, revision: first.revision })),
    /适用口岸或区域条件.*每行一条/,
  );
  const fix = await policy(
    request({
      action: "save",
      groupId,
      revision: first.revision,
      facts: { portsAndRegions: ["虚构口岸"] },
    }),
  );
  assert.equal(fix.status, 200);
  const second = await findDraft();
  assert.equal(
    (await policy(request({ action: "submit", groupId, revision: second.revision }))).status,
    200,
  );
  assert.equal((await findDraft()).reviewState, "review");
  assert.equal(
    (await policy(request({ action: "submit", groupId, revision: second.revision }, ""))).status,
    403,
  );

  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      name: "虚构报错演示咨询",
      email: "feedback@example.invalid",
      reference: key,
      requestKey: key,
      contentHash: key,
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: staff.id,
    },
  });
  const create = (title: string) =>
    business(request({ action: "create", inquiry: inquiry.id, key: randomUUID(), title }));
  await error(await create(""), /填写.*服务单名称.*例如/);
  const service = await create("虚构展会服务单");
  assert.equal(service.status, 200);
  const { case: id } = await service.json();
  const quote = {
    title: "虚构报价",
    scope: "演示",
    included: "演示陪同",
    excluded: "交通",
    terms: "提前联系",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    currency: "CNY",
    lineFormat: 2,
    lines: [
      {
        label: "陪同",
        quantity: 1,
        unitMinor: 100,
        serviceSource: "manual",
        serviceName: "虚构服务方",
      },
      { label: "交通", quantity: 0, unitMinor: 100, serviceSource: "manual", serviceName: "" },
    ],
  };
  const draftQuote = () =>
    business(request({ action: "quote", key: randomUUID(), id, revision: 1, quote }));
  await error(await draftQuote(), /第 2 项费用.*数量.*整数/);
  quote.lines[1].quantity = 1;
  await error(await draftQuote(), /第 2 项费用.*实际服务方.*手填/);
  quote.lines[1].serviceName = "虚构服务方";
  assert.equal((await draftQuote()).status, 200);
  assert.equal(
    (await p.count({ collection: "service-quotes", where: { serviceCase: { equals: id } } }))
      .totalDocs,
    1,
  );
  console.log(
    "PASS core staff HTTP validation, corrected retry, safe error fallback, auth and unchanged draft lifecycle",
  );
} finally {
  if (previousVisa === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = previousVisa;
  await p.destroy();
}
process.exit(0);
