import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition } from "../../src/lib/exhibitions";
const checkedAt = "2026-10-28";
const projects = [
  "hua-project-exhibition-sourcing-support",
  "hua-project-business-interpretation-and-meetings",
  "hua-project-hardware-electrical-factory-visits",
];
const entries = [
  {
    key: "cihf-2027",
    edition: "40 / 2027",
    city: "shanghai",
    start: "2027-03-17",
    end: "2027-03-19",
    industries: ["hardware", "electrical", "machinery"],
    url: "https://www.hardware-fair.com/p/Introduction.html",
    zh: {
      title: "第40届中国国际五金博览会（2027）",
      summary: "面向五金与工具采购的展会信息草稿，日期与场馆依据官方介绍整理。",
      venue: "国家会展中心（上海）",
      address: "上海市青浦区崧泽大道333号",
      audience: "五金、工具及相关机电产品采购商。",
      exhibits: "手动、电动及气动工具，焊接设备和机电产品等。",
      admission: "官网介绍面向已注册专业观众免费入场；具体注册流程与资格需再次核实。",
    },
    en: {
      title: "40th China International Hardware Fair (2027)",
      summary: "Draft sourcing-event information based on the official introduction.",
      venue: "National Exhibition and Convention Center (Shanghai)",
      address: "333 Songze Avenue, Qingpu District, Shanghai",
      audience: "Hardware, tool and related electromechanical product buyers.",
      exhibits:
        "Hand, power and pneumatic tools, welding equipment and electromechanical products.",
      admission:
        "The official introduction states free entry for registered trade visitors; reconfirm registration procedures and eligibility.",
    },
    addressEn: "333 Songze Avenue, Qingpu District, Shanghai, China",
    extra: [],
  },
  {
    key: "cihs-2027",
    edition: "2027",
    city: "shanghai",
    start: "2027-10-09",
    end: "2027-10-11",
    industries: ["hardware"],
    url: "https://www.hardwareshow-china.com/about/",
    zh: {
      title: "中国国际五金展 CIHS（2027）",
      summary: "官方介绍列出的上海五金行业展会，可用于初步安排采购访问。",
      venue: "上海新国际博览中心",
      address: "上海新国际博览中心；具体到达入口待核实",
      audience: "五金行业贸易采购商。",
      exhibits: "五金产品及相关技术；详细展品范围与参展商名录待核实。",
      admission: "观众注册、证件及入场要求需按本届官方说明确认。",
    },
    en: {
      title: "China International Hardware Show CIHS (2027)",
      summary:
        "Shanghai hardware-event information from the official introduction, for preliminary visit planning.",
      venue: "Shanghai New International Expo Centre",
      address: "Shanghai New International Expo Centre; arrival entrance to be confirmed",
      audience: "Hardware trade buyers.",
      exhibits:
        "Hardware products and technologies; detailed categories and exhibitors need confirmation.",
      admission:
        "Confirm registration, credentials and entry requirements with the current edition’s official instructions.",
    },
    addressEn: "Shanghai New International Expo Centre, Shanghai, China; entrance to be confirmed",
    extra: [
      {
        id: "venue",
        title: "Official venue information",
        url: "https://www.hardwareshow-china.com/about/100.html",
        checkedAt,
      },
    ],
  },
  {
    key: "canton-fair-140-phase-1-2026",
    edition: "140 / 2026 / Phase 1",
    city: "guangzhou",
    start: "2026-10-15",
    end: "2026-10-19",
    industries: ["hardware", "electrical", "electronics", "machinery"],
    url: "https://is.mofcom.gov.cn/ExhibitionInfo/art/2026/art_b6ce9bedf8f04544b62fa44ed0f5add0.html",
    zh: {
      title: "第140届广交会第一期（2026秋季）",
      summary: "第一期已结束，作为往届资料整理，不接受本届现场观展安排咨询。",
      venue: "广交会展馆",
      address: "广州阅江中路382号；具体展区入口以当届官方安排为准",
      audience: "电子电器、五金工具及机械设备采购商。",
      exhibits: "家用电器、电子电气产品、五金、工具和机械设备等。",
      admission: "往届资料；下一届日期与报名要求须另建记录并重新核实。",
    },
    en: {
      title: "140th Canton Fair, Phase 1 (Autumn 2026)",
      summary:
        "Phase 1 has ended. This archive draft is not an invitation to book attendance for this edition.",
      venue: "Canton Fair Complex",
      address: "382 Yuejiang Zhong Road, Guangzhou; edition-specific entrance to be confirmed",
      audience: "Electronics, electrical appliance, hardware, tool and machinery buyers.",
      exhibits:
        "Household appliances, electronic/electrical products, hardware, tools and machinery.",
      admission:
        "Historical information. Create a separate record and verify dates and registration for a future edition.",
    },
    addressEn: "382 Yuejiang Zhong Road, Guangzhou, China",
    extra: [
      {
        id: "venue",
        title: "Canton Fair official portal address",
        url: "https://365.cantonfair.org.cn/",
        checkedAt,
      },
    ],
  },
];
export function buildStarterExhibitions(): ContentBody[] {
  return entries.flatMap((entry) =>
    (["zh", "en"] as const).map((locale) => {
      const text = entry[locale];
      return {
        kind: "exhibition",
        contentKey: entry.key,
        slug: entry.key,
        locale,
        title: text.title,
        summary: text.summary,
        category: 2,
        author:
          locale === "zh"
            ? "华伴资料整理草稿（待人工审核）"
            : "Hua editorial draft — pending review",
        blocks: [
          {
            type: "paragraph",
            text:
              locale === "zh"
                ? "华伴可接收采购陪同、翻译及访问协调需求，实际服务范围与档期需另行确认。资料整理不代表主办方合作或入场保证。"
                : "Hua can review sourcing, interpretation and visit-coordination needs. Confirm scope and availability separately; listing an event does not imply organizer partnership or guaranteed entry.",
          },
        ],
        sources: [
          {
            id: "official",
            title:
              locale === "zh"
                ? "官方展会介绍／公告"
                : "Official exhibition introduction / announcement",
            url: entry.url,
            checkedAt,
          },
          ...entry.extra,
        ],
        exhibition: {
          ...emptyExhibition(),
          edition: entry.edition,
          city: entry.city,
          startDate: entry.start,
          endDate: entry.end,
          industries: entry.industries,
          status: entry.key.startsWith("canton-") ? "ended" : "announced",
          venue: text.venue,
          address: text.address,
          addressEn: entry.addressEn,
          audience: text.audience,
          exhibits: text.exhibits,
          admission: text.admission,
          officialURL: entry.url,
          verifiedAt: checkedAt,
          unresolved:
            locale === "zh"
              ? "发布前人工复核官方日期、当届入口、注册规则及可承接服务。"
              : "Before publication, manually reconfirm official dates, edition-specific entrances, registration and available Hua services.",
          projectKeys: projects,
        },
      } satisfies ContentBody;
    }),
  );
}
