import { catalogCities } from "./catalog-options.ts";
import { isLocale, locales } from "./locales.ts";
import { shanghaiToday, validExhibitionDate } from "./exhibitions.ts";

export const institutionTypes = ["medical", "rehabilitation", "wellness"] as const;
export type Institution = {
  type: (typeof institutionTypes)[number];
  city: string;
  address: string;
  addressEn: string;
  directions: string;
  audience: string;
  appointment: string;
  preparation: string;
  fees: string;
  foreignAcceptance: "pending" | "confirmed" | "paused";
  acceptanceConditions: string;
  interpretation: string;
  officialURL: string;
  verifiedAt: string;
  qualification: string;
  unresolved: string;
  languages: string[];
  projectKeys: string[];
};
const textFields = [
  "city",
  "address",
  "addressEn",
  "directions",
  "audience",
  "appointment",
  "preparation",
  "fees",
  "acceptanceConditions",
  "interpretation",
  "officialURL",
  "verifiedAt",
  "qualification",
  "unresolved",
] as const;
export const emptyInstitution = (): Institution => ({
  type: "medical",
  city: "",
  address: "",
  addressEn: "",
  directions: "",
  audience: "",
  appointment: "",
  preparation: "",
  fees: "",
  foreignAcceptance: "pending",
  acceptanceConditions: "",
  interpretation: "",
  officialURL: "",
  verifiedAt: "",
  qualification: "",
  unresolved: "",
  languages: [],
  projectKeys: [],
});
function safeURL(value: string) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validateInstitution(
  i: Institution | undefined,
  publishing = false,
): asserts i is Institution {
  if (!i || typeof i !== "object") throw Error("请填写机构资料");
  for (const key of textFields)
    if (typeof i[key] !== "string" || i[key].length > 5000) throw Error("机构字段格式无效");
  if (!(institutionTypes as readonly string[]).includes(i.type)) throw Error("机构类型无效");
  if (!["pending", "confirmed", "paused"].includes(i.foreignAcceptance))
    throw Error("机构接待状态无效");
  if (i.city && !catalogCities.some((c) => c.code === i.city)) throw Error("请选择有效城市");
  if (
    !Array.isArray(i.languages) ||
    i.languages.length > locales.length ||
    i.languages.some((l) => !isLocale(l)) ||
    new Set(i.languages).size !== i.languages.length
  )
    throw Error("请选择有效接待语言");
  if (
    !Array.isArray(i.projectKeys) ||
    i.projectKeys.length > 100 ||
    i.projectKeys.some((k) => typeof k !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(k)) ||
    new Set(i.projectKeys).size !== i.projectKeys.length
  )
    throw Error("关联服务项目编号无效");
  if (i.officialURL && !safeURL(i.officialURL))
    throw Error("机构官网必须为 http/https 且不含登录信息");
  if (i.verifiedAt && (!validExhibitionDate(i.verifiedAt) || i.verifiedAt > shanghaiToday()))
    throw Error("核验日期无效或晚于今天");
  if (publishing) {
    for (const key of [
      "city",
      "address",
      "addressEn",
      "directions",
      "audience",
      "appointment",
      "preparation",
      "fees",
      "interpretation",
      "officialURL",
      "verifiedAt",
      "qualification",
    ] as const)
      if (!i[key].trim())
        throw Error(
          "发布前请填写地址、服务方向、适用人群、预约、准备、费用、翻译及官方资质核验说明",
        );
    if (
      i.foreignAcceptance === "confirmed" &&
      (!i.acceptanceConditions.trim() || !i.languages.length)
    )
      throw Error("已确认接待需填写接待条件及已核实语言");
    if (i.foreignAcceptance === "pending" && !i.unresolved.trim())
      throw Error("待确认接待需说明待核实事项");
  }
}
export function publicInstitution(i: Institution): Institution {
  const out = emptyInstitution();
  for (const key of textFields) out[key] = i[key];
  out.type = i.type;
  out.foreignAcceptance = i.foreignAcceptance;
  out.languages = [...i.languages];
  out.projectKeys = [...i.projectKeys];
  return out;
}
export function validateInstitutionPublication(
  i: Institution | undefined,
  sources: { url: string; checkedAt?: string }[],
  reviewed: unknown,
) {
  validateInstitution(i, true);
  if (reviewed !== true) throw Error("请确认机构官方来源、资质说明及接待条件已人工核验");
  const official = new URL(i.officialURL).href;
  if (
    !sources.some((s) => {
      try {
        return new URL(s.url).href === official && s.checkedAt === i.verifiedAt;
      } catch {
        return false;
      }
    })
  )
    throw Error("请添加与机构官网及核验日期一致的资料来源");
}
export type InstitutionFilters = { city?: string; type?: string; language?: string; q?: string };
export function filterInstitutions<
  T extends { kind: string; title: string; summary?: string; institution?: Institution },
>(items: T[], filters: InstitutionFilters = {}): T[] {
  return items.filter((d) => {
    const i = d.institution;
    if (d.kind !== "institution" || !i) return false;
    if (
      (filters.city && i.city !== filters.city) ||
      (filters.type && i.type !== filters.type) ||
      (filters.language && !i.languages.includes(filters.language))
    )
      return false;
    return (
      !filters.q ||
      `${d.title} ${d.summary || ""} ${i.address} ${i.addressEn} ${i.directions} ${i.audience} ${i.qualification}`
        .toLowerCase()
        .includes(filters.q.trim().toLowerCase())
    );
  });
}
export function institutionPath(body: { locale: string; slug: string }) {
  return `/${body.locale}/institutions/${body.slug}`;
}
