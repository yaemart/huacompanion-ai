import type { ContentBody } from "../../src/lib/content-model";
import { emptyInstitution, type Institution } from "../../src/lib/institutions";
const checkedAt = "2026-10-29";
// Official pages researched on checkedAt. These are editorial leads, not verified partners.
const entries: {
  key: string;
  zh: string;
  en: string;
  city: string;
  type: Institution["type"];
  url: string;
  address?: string;
  addressEn?: string;
}[] = [
  {
    key: "jiahui-shanghai",
    zh: "上海嘉会国际医院",
    en: "Jiahui International Hospital (Shanghai)",
    city: "shanghai",
    type: "medical",
    url: "https://jiahui.com/en/locations/JIH",
    address: "上海市徐汇区桂平路689号",
    addressEn: "689 Guiping Road, Xuhui District, Shanghai",
  },
  {
    key: "srrsh-international-center",
    zh: "邵逸夫医院国际医疗中心",
    en: "Sir Run Run Shaw Hospital International Medical Center",
    city: "hangzhou",
    type: "medical",
    url: "https://www.srrsh.com/articleInfo/128",
    address: "杭州市上城区庆春东路3号，6号楼11楼",
    addressEn: "Floor 11, Building 6, 3 Qingchun East Road, Shangcheng District, Hangzhou",
  },
  {
    key: "beijing-united-family",
    zh: "北京和睦家医院",
    en: "Beijing United Family Hospital",
    city: "beijing",
    type: "medical",
    url: "https://beijing.ufh.com.cn/locations/main-campus",
  },
  {
    key: "guangzhou-united-family",
    zh: "广州和睦家医院",
    en: "Guangzhou United Family Hospital",
    city: "guangzhou",
    type: "medical",
    url: "https://guangzhou.ufh.com.cn/locations/guangzhou-united-family-hospital",
  },
  {
    key: "beijing-united-family-rehabilitation",
    zh: "北京和睦家康复医院",
    en: "Beijing United Family Rehabilitation Hospital",
    city: "beijing",
    type: "rehabilitation",
    url: "https://beijing.ufh.com.cn/locations/rehabilitation-hospital",
  },
  {
    key: "taikang-shen-garden",
    zh: "泰康之家·申园",
    en: "Taikang Community Shen Garden",
    city: "shanghai",
    type: "wellness",
    url: "https://sy.taikangzhijia.com/",
  },
];
export function buildStarterInstitutions(): ContentBody[] {
  return entries.flatMap((entry) =>
    (["zh", "en"] as const).map((locale) => {
      const zh = locale === "zh";
      return {
        kind: "institution",
        contentKey: entry.key,
        slug: entry.key,
        locale,
        title: entry[locale],
        summary: zh
          ? "根据机构官方页面建立的候选资料，尚待人工核验接待条件及华伴可协调范围。"
          : "Candidate record based on an official page. Reception conditions and available Hua coordination remain to be verified.",
        author: zh ? "华伴资料整理草稿（待审核）" : "Hua editorial draft — pending review",
        blocks: [
          {
            type: "paragraph",
            text: zh
              ? "本记录不代表机构与华伴已有合作。预约、接待条件、实际服务语言及费用均需逐项确认。"
              : "This record does not imply a partnership with Hua. Appointments, reception conditions, service languages and fees require confirmation.",
          },
        ],
        sources: [
          {
            id: "official",
            title: zh ? "机构官方资料（候选来源）" : "Official institution page (candidate source)",
            url: entry.url,
            checkedAt,
          },
        ],
        institution: {
          ...emptyInstitution(),
          type: entry.type,
          city: entry.city,
          address: entry.address || "",
          addressEn: entry.addressEn || "",
          officialURL: entry.url,
          // Source retrieval is not the completed human qualification/reception review.
          verifiedAt: "",
          foreignAcceptance: "pending",
          unresolved: zh
            ? "需核验机构主体与资质、具体院区地址、外籍接待条件、实际服务语言、预约和收费要求；康养入住另需确认短住、年龄及陪同条件。"
            : "Verify legal identity and qualifications, exact location, foreign visitor eligibility, " +
              "actual service languages, appointment and fee requirements. Wellness stays also need " +
              "duration, age and companion conditions checked.",
          qualification: "",
          languages: [],
          projectKeys: [],
        },
      } satisfies ContentBody;
    }),
  );
}
