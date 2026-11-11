import type { Locale } from "./locales.ts";
export type { Locale } from "./locales.ts";
export const serviceCategoryOptions = [
  { label: "家政与居家服务", value: "housekeeping" },
  { label: "医疗机构对接", value: "medical" },
  { label: "展会与商务访问", value: "business" },
  { label: "接送机与交通", value: "transport" },
  { label: "酒店与长期住宿", value: "stays" },
  { label: "旅游机构对接", value: "travel" },
  { label: "翻译与陪同", value: "interpretation" },
  { label: "来华准备与生活协助", value: "arrival" },
];
export const serviceSlugs = serviceCategoryOptions.map(({ value }) => value);
export const guideSlugs = [
  "before-you-arrive",
  "business-visit-brief",
  "medical-visit-process",
  "transfer-checklist",
  "choosing-your-stay",
  "everyday-confidence",
];
export function switchLocale(path: string, locale: Locale): string {
  return path.replace(/^\/(zh|en|es|fr|de|it|ar)(?=\/|[?#]|$)/, `/${locale}`);
}
export function isKnownRoute(slug: string[]): boolean {
  if (!slug.length) return true;
  if (slug.length === 1)
    return [
      "support",
      "account",
      "exhibitions",
      "institutions",
      "life",
      "services",
      "guides",
      "partners",
      "about",
      "contact",
      "request",
      "apply",
      "privacy",
      "terms",
    ].includes(slug[0]);
  if (slug.length === 2 && slug[0] === "services") return serviceSlugs.includes(slug[1]);
  if (slug.length === 2 && slug[0] === "guides") return guideSlugs.includes(slug[1]);
  return false;
}
