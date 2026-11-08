import { readFileSync } from "node:fs";
import path from "node:path";
import { assertDemo } from "./lib/demo-environment.mjs";
import { demoEntries } from "./lib/demo-fixtures";
import type { Staff } from "../payload-types";
const state = JSON.parse(
  readFileSync(path.join(process.env.HUA_DEMO_ROOT || "", "state.json"), "utf8"),
);
assertDemo(state);
if (process.env.APP_ENV !== "local" || process.env.DATABASE_URL !== state.databaseURL)
  throw Error("拒绝在非演示环境载入数据");
const { getPayload } = await import("payload");
const { default: config } = await import("../src/payload.config");
const { mutateContent } = await import("../src/server/content/service");
const { businessAction, businessRead } = await import("../src/server/business/service");
const { configureTrial } = await import("../src/server/trial-config");
const { shanghaiToday } = await import("../src/lib/exhibitions");
const p = await getPayload({ config });
const people: Record<string, Staff> = {};
try {
  let team = (await p.find({ collection: "teams", where: { name: { equals: "演示团队" } } }))
    .docs[0];
  if (!team) team = await p.create({ collection: "teams", data: { name: "演示团队" } });
  for (const key of ["admin", "manager", "operations", "reviewer", "newcomer"] as const) {
    let person = (
      await p.find({ collection: "staff", where: { email: { equals: state.accounts[key].email } } })
    ).docs[0];
    if (!person)
      person = await p.create({
        collection: "staff",
        user: people.admin,
        context: { allowLocalStaffSetup: key === "admin" },
        data: {
          ...state.accounts[key],
          name: `演示·${key}`,
          role: key === "newcomer" ? "operations" : key,
          active: true,
          team: team.id,
          additionalRoles: ["operations", "newcomer"].includes(key) ? ["editor"] : [],
          contentKinds: ["immigration-policy", "guide", "exhibition", "page", "service"],
        },
      });
    people[key] = person;
  }
  await configureTrial(p, process.env, true);
  const today = shanghaiToday();
  for (const entry of demoEntries(today, people.reviewer.id)) {
    const body = entry.body;
    let draft = (
      await p.find({
        collection: "content-drafts",
        where: { identity: { equals: `${body.contentKey}:${body.locale}` } },
      })
    ).docs[0];
    if (!draft)
      draft = await mutateContent(p, people.operations, {
        action: "save",
        body,
        ...(entry.policy ? { policy: entry.policy } : {}),
      });
    if (draft.reviewState === "draft")
      draft = await mutateContent(p, people.operations, {
        action: "submit",
        id: draft.id,
        revision: draft.revision,
      });
    if (entry.publish && draft.reviewState === "review")
      await mutateContent(p, people.reviewer, {
        action: "publish",
        id: draft.id,
        revision: draft.revision,
        policyReviewed: true,
        exhibitionReviewed: true,
      });
  }
  const statuses = ["new", "needs-info", "processing", "closed", "new"] as const;
  for (let n = 1; n <= 5; n++) {
    const reference = `DEMO-INQUIRY-${n}`;
    let inquiry = (
      await p.find({ collection: "inquiries", where: { reference: { equals: reference } } })
    ).docs[0];
    if (!inquiry)
      inquiry = await p.create({
        collection: "inquiries",
        user: people.admin,
        data: {
          reference,
          requestKey: `demo-inquiry-request-${n}`,
          contentHash: `demo-content-${n}`,
          name: `虚构客户${n}`,
          email: `customer-${n}@example.invalid`,
          categories: ["business"],
          city: "Shanghai",
          status: statuses[n - 1],
          team: team.id,
          owner: n <= 2 ? people.operations.id : n === 5 ? people.newcomer.id : null,
          nextFollowUp: new Date(Date.parse(today) + 8 * 3600000).toISOString(),
          notes: "虚构演示咨询，勿联系真实客户。",
          details: {
            purpose: "虚构展会陪同需求",
            language: "English",
            people: "2",
            arrivalDate: today,
          },
        },
      });
    if (n > 2) continue;
    const created = await businessAction(p, people.manager, {
      action: "create",
      inquiry: inquiry.id,
      title: `演示商务服务${n}`,
      key: `demo-create-case-${n}`,
    });
    const detail = await businessRead(p, people.manager, created.case);
    if (!detail.quotes.length)
      await businessAction(p, people.manager, {
        action: "quote",
        id: created.case,
        revision: detail.case.revision,
        key: `demo-create-quote-${n}`,
        quote: {
          title: `演示报价${n}（未发出；二审待F）`,
          scope: "虚构商务陪同",
          included: "演示协调费用",
          excluded: "交通住宿",
          terms: "仅演示，不构成真实报价",
          currency: "CNY",
          expiresAt: new Date(Date.parse(today) + 30 * 86400000).toISOString(),
          lines: [{ label: "演示协调服务", quantity: 1, unitMinor: 20000 }],
          internalCostMinor: 12000,
        },
      });
  }
  for (const [i, status] of (["applied", "needs-info", "verified"] as const).entries()) {
    const reference = `DEMO-PROVIDER-${i + 1}`;
    if (
      (await p.find({ collection: "providers", where: { reference: { equals: reference } } }))
        .totalDocs
    )
      continue;
    await p.create({
      collection: "providers",
      user: people.admin,
      data: {
        reference,
        requestKey: `demo-provider-request-${i}`,
        contentHash: `demo-provider-${i}`,
        name: `虚构联系人${i + 1}`,
        email: `provider-${i}@example.invalid`,
        organisation: `虚构演示服务商${i + 1}`,
        phone: "DEMO-NO-REAL-PHONE",
        languages: "中文,English",
        capabilities: "虚构演示陪同服务，不提供真实交付。",
        categories: ["business"],
        city: "Shanghai",
        team: team.id,
        owner: i === 0 ? people.operations.id : i === 1 ? people.newcomer.id : null,
        status,
        publicApproved: false,
        notes: "仅演示，禁止联系或公开为真实商家。",
      },
    });
  }
  console.log(
    "新版演示已载入：5页、3服务、5指南、3展会、3政策双语发布，政策及指南各1条待审；5咨询3申请2服务单2人工草稿5账号。真正待审核报价留待F。",
  );
} finally {
  await p.destroy();
}
process.exit(0);
