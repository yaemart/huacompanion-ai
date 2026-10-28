import { catalogCities } from "./catalog-options.ts";

export const exhibitionIndustries = ["hardware", "electrical", "machinery", "electronics", "building", "consumer", "other"] as const;
export type Exhibition = {
  edition: string; city: string; venue: string; address: string; addressEn: string;
  startDate: string; endDate: string; audience: string; exhibits: string; admission: string;
  officialURL: string; registrationURL: string; verifiedAt: string; unresolved: string;
  industries: string[];
  status: "pending" | "announced" | "postponed" | "cancelled" | "ended";
  projectKeys: string[];
};
const textFields = ["edition", "city", "venue", "address", "addressEn", "startDate", "endDate", "audience", "exhibits", "admission", "officialURL", "registrationURL", "verifiedAt", "unresolved"] as const;
export const emptyExhibition = (): Exhibition => ({
  edition: "", city: "", venue: "", address: "", addressEn: "", startDate: "", endDate: "", audience: "", exhibits: "", admission: "", officialURL: "", registrationURL: "", verifiedAt: "", unresolved: "", industries: [], status: "pending", projectKeys: [],
});
export function shanghaiToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function validExhibitionDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function safeURL(value: string) {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function validateExhibition(e: Exhibition | undefined, publishing = false): asserts e is Exhibition {
  if (!e || typeof e !== "object") throw Error("请填写展会资料");
  for (const k of textFields) if (typeof e[k] !== "string" || e[k].length > 5000) throw Error("展会字段格式无效");
  if (!["pending", "announced", "postponed", "cancelled", "ended"].includes(e.status)) throw Error("展会状态无效");
  if (e.city && !catalogCities.some(c => c.code === e.city)) throw Error("请选择有效城市");
  if (!Array.isArray(e.industries) || e.industries.length > exhibitionIndustries.length || e.industries.some(x => !(exhibitionIndustries as readonly string[]).includes(x)) || new Set(e.industries).size !== e.industries.length) throw Error("请选择有效展会行业");
  if (!Array.isArray(e.projectKeys) || e.projectKeys.length > 100 || e.projectKeys.some(x => typeof x !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(x))) throw Error("关联服务项目编号无效");
  if (e.startDate || e.endDate) {
    if (!validExhibitionDate(e.startDate) || !validExhibitionDate(e.endDate) || e.startDate > e.endDate) throw Error("请填写有效且顺序正确的起止日期");
  } else if (!["pending", "postponed"].includes(e.status)) throw Error("当前状态需要完整展会日期");
  for (const k of ["officialURL", "registrationURL"] as const) if (e[k] && !safeURL(e[k])) throw Error("展会链接必须为 http/https 且不含登录信息");
  if (e.verifiedAt && (!validExhibitionDate(e.verifiedAt) || e.verifiedAt > shanghaiToday())) throw Error("核验日期无效或晚于今天");
  if (publishing) {
    for (const k of ["edition", "city", "venue", "address", "audience", "exhibits", "admission", "officialURL", "verifiedAt"] as const) if (!e[k].trim()) throw Error("发布前请填写届次、城市、场馆、地址、观众、展品、入场及官方核验信息");
    if (!e.industries.length) throw Error("发布前请选择行业");
    if (["pending", "postponed"].includes(e.status) && !e.unresolved.trim()) throw Error("待公布或延期展会需说明待确认事项");
    if (e.status === "ended" && e.endDate >= shanghaiToday()) throw Error("尚未结束的展会不能标记已结束");
  }
}
export function publicExhibition(e: Exhibition): Exhibition {
  const out = emptyExhibition();
  for (const k of textFields) out[k] = e[k];
  out.status = e.status; out.industries = [...e.industries]; out.projectKeys = [...e.projectKeys];
  return out;
}
export function effectiveExhibitionStatus(e: Exhibition, today = shanghaiToday()): Exhibition["status"] {
  if (["cancelled", "postponed"].includes(e.status)) return e.status;
  return e.endDate && e.endDate < today ? "ended" : e.status;
}
export type ExhibitionFilters = { city?: string; industry?: string; month?: string; q?: string; archive?: boolean | string; period?: "upcoming" | "past" | "all" };
export function filterExhibitions<T extends { kind: string; title: string; summary?: string; exhibition?: Exhibition }>(items: T[], filters: ExhibitionFilters = {}, today = shanghaiToday()): T[] {
  return items.filter(d => {
    const e = d.exhibition;
    if (d.kind !== "exhibition" || !e) return false;
    const archived = ["ended", "cancelled"].includes(effectiveExhibitionStatus(e, today));
    const archive = filters.period === "past" || filters.archive === true || filters.archive === "true" || filters.archive === "1";
    if (filters.period !== "all" && filters.archive !== "all" && archived !== archive) return false;
    if (filters.city && e.city !== filters.city || filters.industry && !e.industries.includes(filters.industry)) return false;
    if (filters.month && (!e.startDate || !e.endDate || e.startDate.slice(0, 7) > filters.month || e.endDate.slice(0, 7) < filters.month)) return false;
    return !filters.q || `${d.title} ${d.summary || ""} ${e.edition} ${e.venue} ${e.address} ${e.addressEn} ${e.exhibits}`.toLowerCase().includes(filters.q.trim().toLowerCase());
  }).sort((a, b) => {
    const ad = a.exhibition!.startDate, bd = b.exhibition!.startDate;
    if (!ad || !bd) return ad ? -1 : bd ? 1 : a.title.localeCompare(b.title);
    const order = ad.localeCompare(bd);
    const past = filters.period === "past" || filters.archive === true || filters.archive === "true" || filters.archive === "1";
    return (past ? -order : order) || a.title.localeCompare(b.title);
  });
}
export function exhibitionPath(body: { locale: string; slug: string }) { return `/${body.locale}/exhibitions/${body.slug}`; }
export function validateExhibitionPublication(e: Exhibition | undefined, sources: {url:string; checkedAt?:string}[], reviewed: unknown) {
  validateExhibition(e, true);
  if (reviewed !== true) throw Error("请确认展会官方来源、日期、地址和入场信息已人工核验");
  const official = new URL(e.officialURL).href;
  if (!sources.some(s => { try { return new URL(s.url).href === official && s.checkedAt === e.verifiedAt; } catch { return false; } })) throw Error("请添加与官方网站及核验日期一致的资料来源");
}
