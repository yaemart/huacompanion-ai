import type { Locale } from "./locales.ts";
import {
  catalogCities,
  catalogLanguages,
  cityLabel,
} from "./catalog-options.ts";
import { serviceSlugs } from "./routes.ts";
export type CatalogSource = { provider?: string; project?: string };
export type Catalog = {
  categories: string[];
  cities: { code: string; name: string }[];
  languages: string[];
  capabilities: string;
  verification: { label: string; checkedAt: string }[];
  audience: string;
  includes: string;
  excludes: string;
  process: string;
  deliverables: string;
  materials: string;
  bookingNotice: string;
  duration: string;
  people: string;
  changes: string;
  fulfillment: "arranged" | "specified";
  providerKeys: string[];
  guideKeys: string[];
  price: {
    mode: "quote" | "fixed" | "from";
    amount?: number;
    currency?: string;
    unit?: string;
    conditions?: string;
  };
};
export const isCatalog = (kind: string) =>
  ["provider-profile", "service-project"].includes(kind);
export const emptyCatalog = (): Catalog => ({
  categories: [],
  cities: [],
  languages: [],
  capabilities: "",
  verification: [],
  audience: "",
  includes: "",
  excludes: "",
  process: "",
  deliverables: "",
  materials: "",
  bookingNotice: "",
  duration: "",
  people: "",
  changes: "",
  fulfillment: "arranged",
  providerKeys: [],
  guideKeys: [],
  price: { mode: "quote" },
});
const keyPattern = /^[a-z0-9][a-z0-9-]{0,99}$/;
export function parseCatalogSource(value: unknown): CatalogSource | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid service selection");
  const raw = value as Record<string, unknown>;
  const out: CatalogSource = {};
  for (const k of ["provider", "project"] as const)
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "string" || !keyPattern.test(raw[k]))
        throw Error("Invalid service selection");
      out[k] = raw[k];
    }
  if (!out.provider && !out.project) throw Error("Empty service selection");
  return out;
}
export function validateCatalog(
  kind: string,
  c: Catalog | undefined,
  publishing = false,
) {
  if (
    !c ||
    !Array.isArray(c.categories) ||
    c.categories.length > 7 ||
    c.categories.some((x) => !serviceSlugs.includes(x))
  )
    throw Error("请选择有效服务分类");
  if (
    !Array.isArray(c.cities) ||
    c.cities.length > catalogCities.length ||
    c.cities.some(
      (x) =>
        !x ||
        !catalogCities.some((c) => c.code === x.code) ||
        typeof x.name !== "string" ||
        !x.name.trim() ||
        x.name.length > 100,
    )
  )
    throw Error("请选择上海、北京、广州、深圳、重庆、杭州、武汉或南京");
  if (
    !Array.isArray(c.languages) ||
    c.languages.length > catalogLanguages.length ||
    c.languages.some((x) => !catalogLanguages.some((l) => l.code === x))
  )
    throw Error("请选择有效服务语言（中文、英文、西班牙文、法文、德文、意大利文或阿拉伯文）");
  for (const k of ["providerKeys", "guideKeys"] as const)
    if (
      !Array.isArray(c[k]) ||
      c[k].length > 100 ||
      c[k].some((x) => !keyPattern.test(x))
    )
      throw Error("关联内容编号无效");
  for (const k of [
    "capabilities",
    "audience",
    "includes",
    "excludes",
    "process",
    "deliverables",
    "materials",
    "bookingNotice",
    "duration",
    "people",
    "changes",
  ] as const)
    if (typeof c[k] !== "string" || c[k].length > 5000)
      throw Error("服务说明格式无效");
  if (
    !Array.isArray(c.verification) ||
    c.verification.length > 30 ||
    c.verification.some(
      (x) =>
        !x ||
        typeof x.label !== "string" ||
        !x.label.trim() ||
        x.label.length > 200 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(x.checkedAt) ||
        !Number.isFinite(Date.parse(x.checkedAt)) ||
        new Date(x.checkedAt).toISOString().slice(0, 10) !== x.checkedAt ||
        x.checkedAt > new Date().toISOString().slice(0, 10),
    )
  )
    throw Error("核验项目需要名称与有效核验日期");
  if (!["arranged", "specified"].includes(c.fulfillment))
    throw Error("请选择履约方式");
  if (!c.price || !["quote", "fixed", "from"].includes(c.price.mode))
    throw Error("请选择计价方式");
  if (
    c.price.mode !== "quote" &&
    (!Number.isFinite(c.price.amount) ||
      c.price.amount! <= 0 ||
      c.price.amount! > 100000000 ||
      !/^([A-Z]{3})$/.test(c.price.currency || "") ||
      !c.price.unit?.trim() ||
      !c.price.conditions?.trim())
  )
    throw Error("价格需要正数金额、币种、单位和适用条件");
  for (const s of [c.price.unit, c.price.conditions])
    if (s !== undefined && (typeof s !== "string" || s.length > 2000))
      throw Error("价格说明无效");
  if (publishing) {
    if (!c.categories.length || !c.cities.length || !c.languages.length)
      throw Error("发布前请填写分类、城市及语言");
    if (kind === "provider-profile" && !c.capabilities.trim())
      throw Error("请填写服务能力");
    if (kind === "service-project") {
      for (const k of [
        "audience",
        "includes",
        "excludes",
        "process",
        "deliverables",
        "materials",
        "bookingNotice",
        "duration",
        "people",
        "changes",
      ] as const)
        if (!c[k].trim())
          throw Error("发布前请完整填写项目范围、流程、预约和变更说明");
      if (c.fulfillment === "specified" && !c.providerKeys.length)
        throw Error("指定履约项目必须关联服务商");
      if (c.fulfillment === "arranged" && c.providerKeys.length)
        throw Error("按需求安排的项目请清除指定服务商，或改为指定履约");
    }
  }
}
export function publicCatalog(c: Catalog, locale: Locale = "zh"): Catalog {
  const out = emptyCatalog();
  for (const k of [
    "capabilities",
    "audience",
    "includes",
    "excludes",
    "process",
    "deliverables",
    "materials",
    "bookingNotice",
    "duration",
    "people",
    "changes",
  ] as const)
    out[k] = c[k];
  out.categories = [...c.categories];
  out.cities = c.cities.map((x) => ({
    code: x.code,
    name: cityLabel(x.code, locale),
  }));
  out.languages = [...c.languages];
  out.verification = c.verification.map((x) => ({
    label: x.label,
    checkedAt: x.checkedAt,
  }));
  out.fulfillment = c.fulfillment;
  out.providerKeys = [...c.providerKeys];
  out.guideKeys = [...c.guideKeys];
  out.price =
    c.price.mode === "quote"
      ? { mode: "quote" }
      : {
          mode: c.price.mode,
          amount: c.price.amount,
          currency: c.price.currency,
          unit: c.price.unit,
          conditions: c.price.conditions,
        };
  return out;
}
export function catalogPath(d: { kind: string; locale: string; slug: string }) {
  return `/${d.locale}/${d.kind === "provider-profile" ? "providers" : "services/projects"}/${d.slug}`;
}
export function catalogFilter<
  T extends {
    kind: string;
    title: string;
    summary?: string;
    catalog?: Catalog;
  },
>(
  items: T[],
  q: {
    kind?: string;
    category?: string;
    city?: string;
    language?: string;
    q?: string;
  },
) {
  return items.filter(
    (d) =>
      isCatalog(d.kind) &&
      (!q.kind || d.kind === q.kind) &&
      (!q.category || d.catalog?.categories.includes(q.category)) &&
      (!q.city || d.catalog?.cities.some((c) => c.code === q.city)) &&
      (!q.language || d.catalog?.languages.includes(q.language)) &&
      (!q.q ||
        `${d.title} ${d.summary || ""} ${d.catalog?.capabilities || ""}`
          .toLowerCase()
          .includes(q.q.toLowerCase())),
  );
}
export function priceText(c: Catalog, locale: Locale) {
  const labels: Record<Locale, [string, string]> = {
    zh: ["按需求询价", " 起"], en: ["Quote on request", " and up"],
    es: ["Presupuesto a medida", " en adelante"], fr: ["Sur devis", " et plus"],
    de: ["Preis auf Anfrage", " aufwärts"], it: ["Preventivo su richiesta", " e oltre"],
    ar: ["السعر عند الطلب", " فأكثر"],
  };
  return c.price.mode === "quote" ? labels[locale][0]
    : `${c.price.currency} ${c.price.amount} / ${c.price.unit}${c.price.mode === "from" ? labels[locale][1] : ""}`;
}
export function inquiryFormKey(
  locale: string,
  service: string | undefined,
  source: CatalogSource | undefined,
) {
  return JSON.stringify([
    locale,
    service || "",
    source?.provider || "",
    source?.project || "",
  ]);
}
