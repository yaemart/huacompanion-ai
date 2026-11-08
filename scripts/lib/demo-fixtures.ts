import type { ContentBody } from "../../src/lib/content-model";
import type { PolicyPublicationData } from "../../src/lib/immigration-policy";
import { emptyExhibition } from "../../src/lib/exhibitions.ts";
export type DemoEntry = { body: ContentBody; publish: boolean; policy?: PolicyPublicationData };
const companyZh = "演示内容，非真实公司信息";
const companyEn = "DEMO ONLY — not real company information";
export function demoEntries(today: string, verifiedBy: number): DemoEntry[] {
  const day = (offset: number) =>
    new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10);
  const entries: DemoEntry[] = [];
  for (const locale of ["zh", "en"] as const) {
    const zh = locale === "zh";
    const add = (
      kind: ContentBody["kind"],
      slug: string,
      title: string,
      publish = true,
    ): DemoEntry => {
      const entry: DemoEntry = {
        publish,
        body: {
          kind,
          slug,
          locale,
          contentKey: `demo-${kind}-${slug}`,
          title: `${zh ? "演示" : "DEMO"} · ${title}`,
          summary: zh
            ? "虚构演示资料，不用于真实服务或出行。"
            : "Fictional demo material, not for real services or travel.",
          blocks: [
            {
              type: "paragraph",
              text: zh
                ? "以下资料仅用于本地操作测试。"
                : "The following material is for local testing only.",
            },
          ],
          sources: [
            {
              id: "demo",
              title: zh ? "虚构演示来源" : "Fictional demo source",
              url: "https://example.invalid/demo",
              checkedAt: today,
            },
          ],
        },
      };
      entries.push(entry);
      return entry;
    };
    const home = add("page", "home", zh ? "外国人来华的第一站" : "Your first stop in China");
    home.body.summary = zh
      ? "来之前查资料，到了找协助：展会陪同、看厂和接机。仅演示。"
      : "Prepare your visit and find help with exhibitions, factory visits and airport transfers. Demo only.";
    for (const [slug, cn, en] of [
      ["about", "关于我们", "About us"],
      ["contact", "联系方式", "Contact"],
      ["privacy", "隐私说明", "Privacy"],
      ["terms", "服务边界", "Service boundaries"],
    ]) {
      const e = add("page", slug, zh ? cn : en);
      e.body.blocks = [
        { type: "heading", text: zh ? companyZh : companyEn },
        {
          type: "paragraph",
          text: zh
            ? "这里是待真实主体资料及律师文本替换的占位版，不收集证件资料。"
            : "This placeholder awaits real company details and reviewed text. Do not enter identity documents.",
        },
      ];
      if (slug === "contact")
        e.body.blocks.push({
          type: "paragraph",
          text: zh
            ? "演示邮箱：demo@example.invalid，不可投递。"
            : "Demo email: demo@example.invalid. Not deliverable.",
        });
    }
    for (const [slug, cn, en] of [
      [
        "exhibition-companion",
        "展会陪同与翻译",
        "Exhibition companion and interpretation",
        "business",
      ],
      ["factory-visit", "看厂陪同", "Factory visit companion", "business"],
      ["airport-pickup", "接机协助", "Airport transfer assistance", "transport"],
    ]) {
      add("service", slug, zh ? cn : en);
    }
    for (let n = 1; n <= 6; n++) {
      const e = add(
        "guide",
        `guide-${n}`,
        zh ? `来华准备指南${n}` : `Visit preparation guide ${n}`,
        n <= 5,
      );
      e.body.category = (n - 1) % 8;
      e.body.blocks = [
        { type: "heading", text: zh ? "虚构行程准备" : "Fictional visit preparation" },
        ...Array.from({ length: 12 }, (_, i) => ({
          type: "paragraph" as const,
          text: zh
            ? `演示段落${i + 1}：这是一份虚构的来访准备材料，用于测试编辑、来源核对和双人审核。请记录操作过程中的疑问，不要据此安排真实出行；日期、地点及服务信息均需日后人工核实。`
            : `Demo paragraph ${i + 1}: This fictional preparation note tests editing, source checks and two-person review. ` +
              "Record unclear steps. Do not arrange real travel using it; dates, places and services need future verification.",
        })),
      ];
    }
    for (let n = 1; n <= 3; n++) {
      const e = add(
        "exhibition",
        `exhibition-${n}`,
        zh ? `虚构展会${n}` : `Fictional exhibition ${n}`,
      );
      const offset = n === 1 ? 30 : n === 2 ? -1 : -30;
      e.body.exhibition = {
        ...emptyExhibition(),
        edition: "DEMO",
        city: "shanghai",
        venue: zh ? "虚构演示场馆" : "Fictional demo venue",
        address: zh ? "演示地址，不可用于出行" : "Fictional address, not for travel",
        addressEn: "Fictional address",
        audience: zh ? "虚构买家" : "Demo buyers",
        exhibits: zh ? "演示商品" : "Demo products",
        admission: zh ? "虚构登记说明" : "Demo registration",
        officialURL: "https://example.invalid/demo",
        verifiedAt: today,
        startDate: day(offset),
        endDate: day(offset + 2),
        industries: ["other"],
        status: "announced",
      };
    }
    for (const [n, code] of ["XY", "XZ", "XW", "XQ"].entries()) {
      const e = add(
        "immigration-policy",
        `policy-${n + 1}`,
        zh ? `虚构测试国家${code}` : `Fictional country ${code}`,
        n < 3,
      );
      e.policy = {
        countryCode: code,
        countryNameZh: `虚构测试国家${code}`,
        countryNameEn: `Fictional DEMO country ${code}`,
        policyType: n === 1 ? "transit-240h" : "unilateral",
        maxStayDays: n === 1 ? 10 : 30,
        validFrom: n === 0 ? "2026-11-01" : day(-90),
        validUntil: n === 0 ? "2026-12-31" : day(n === 2 ? -1 : 90),
        lastVerifiedOn: today,
        verifiedBy,
        officialSourceUrl: "https://example.invalid/policy",
        portsAndRegions: [zh ? "虚构演示口岸及停留区域" : "Fictional eligible port and region"],
        publicNotes: zh
          ? n === 1
            ? "仅演示：须持前往第三国的联程机票，最多240小时。"
            : "仅虚构演示，不代表真实政策。"
          : n === 1
            ? "Demo only: an onward ticket to a third country is required; maximum 240 hours."
            : "Fictional demo only, not real policy.",
        internalNotes: "DEMO ONLY",
      };
    }
  }
  return entries;
}
