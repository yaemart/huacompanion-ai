import { readFileSync } from "node:fs";
import path from "node:path";
import { assertDemo } from "./lib/demo-environment.mjs";
import type { ContentBody } from "../src/lib/content-model";
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
const { emptyExhibition, shanghaiToday } = await import("../src/lib/exhibitions");
const p = await getPayload({ config });
const today = shanghaiToday();
const day = (n: number) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
const people: Record<string, Staff> = {};
try {
  let team = (await p.find({ collection: "teams", where: { name: { equals: "演示团队" } } }))
    .docs[0];
  if (!team) team = await p.create({ collection: "teams", data: { name: "演示团队" } });
  for (const role of ["admin", "manager", "operations", "reviewer"] as const) {
    let person = (
      await p.find({
        collection: "staff",
        where: { email: { equals: state.accounts[role].email } },
      })
    ).docs[0];
    if (!person)
      person = await p.create({
        collection: "staff",
        user: people.admin,
        context: { allowLocalStaffSetup: role === "admin" },
        data: {
          ...state.accounts[role],
          name: `演示·${role}`,
          role,
          active: true,
          team: team.id,
          additionalRoles: role === "operations" ? ["editor"] : [],
          contentKinds: ["immigration-policy", "guide", "exhibition"],
        },
      });
    people[role] = person;
  }
  await configureTrial(p, process.env, true);
  for (const kind of ["immigration-policy", "guide", "exhibition"] as const) {
    for (const n of [1, 2])
      for (const locale of ["zh", "en"] as const) {
        const contentKey = `demo-${kind}-${n}`.replace("immigration-policy", "policy");
        const body: ContentBody = {
          contentKey,
          kind,
          locale,
          slug: contentKey,
          title: `${locale === "zh" ? "演示" : "DEMO"} · ${kind} ${n}`,
          summary: "虚构演示资料，不能作为真实政策或展会安排依据。",
          blocks: [
            { type: "paragraph", text: "虚构演示：可编辑、送审并由另一账号审核。DEMO ONLY." },
          ],
          sources: [
            {
              id: "demo",
              title: "虚构来源（仅演示，不联网核实）",
              url: "https://example.invalid/demo",
              checkedAt: today,
            },
          ],
        };
        if (kind === "exhibition")
          body.exhibition = {
            ...emptyExhibition(),
            edition: "DEMO",
            city: "shanghai",
            venue: "虚构演示场馆",
            address: "虚构地址，不可用于出行",
            addressEn: "Fictional demo address",
            audience: "虚构买家",
            exhibits: "演示商品",
            admission: "虚构登记方式",
            officialURL: "https://example.invalid/demo",
            verifiedAt: today,
            startDate: day(30),
            endDate: day(32),
            industries: ["other"],
            status: "announced",
          };
        const existing = (
          await p.find({
            collection: "content-drafts",
            where: { identity: { equals: `${contentKey}:${locale}` } },
          })
        ).docs[0];
        let draft = existing;
        if (!draft)
          draft = await mutateContent(p, people.operations, {
            action: "save",
            body,
            ...(kind === "immigration-policy"
              ? {
                  policy: {
                    countryCode: n === 1 ? "XY" : "XZ",
                    countryNameZh: `虚构测试国家${n}`,
                    countryNameEn: `Fictional DEMO country ${n}`,
                    policyType: n === 1 ? "unilateral" : "transit-240h",
                    maxStayDays: n === 1 ? 30 : 10,
                    validFrom: today,
                    validUntil: day(90),
                    lastVerifiedOn: today,
                    verifiedBy: people.reviewer.id,
                    officialSourceUrl: "https://example.invalid/policy",
                    portsAndRegions: ["虚构演示口岸条件"],
                    publicNotes: "仅为虚构演示，不代表任何真实国家政策。",
                    internalNotes: "演示内部核实记录",
                  },
                }
              : {}),
          });
        if (draft.reviewState === "draft")
          draft = await mutateContent(p, people.operations, {
            action: "submit",
            id: draft.id,
            revision: draft.revision,
          });
        if (n === 1 && draft.reviewState === "review")
          await mutateContent(p, people.reviewer, {
            action: "publish",
            id: draft.id,
            revision: draft.revision,
            policyReviewed: true,
            exhibitionReviewed: true,
          });
      }
  }
  for (const n of [1, 2, 3]) {
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
          status: "new",
          team: team.id,
          owner: n < 3 ? people.operations.id : null,
          notes: "虚构演示咨询，勿联系真实客户。",
        },
      });
    if (n === 3) continue;
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
          title: `演示报价${n}`,
          scope: "虚构商务陪同",
          included: "演示协调费用",
          excluded: "交通住宿",
          terms: "仅演示，不构成真实报价",
          currency: "CNY",
          expiresAt: new Date(Date.parse(day(30))).toISOString(),
          lines: [{ label: "演示协调服务", quantity: 1, unitMinor: 20000 }],
          internalCostMinor: 12000,
        },
      });
  }
  console.log("演示数据已载入：政策/指南/展会各4份中英工作稿、6份正式示例、3条咨询、2份报价。");
} finally {
  await p.destroy();
}
process.exit(0);
