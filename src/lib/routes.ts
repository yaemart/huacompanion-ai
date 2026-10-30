import type { Locale } from "./locales.ts";
export type { Locale } from "./locales.ts";
export const serviceSlugs = [
  "housekeeping",
  "medical",
  "business",
  "transport",
  "stays",
  "travel",
  "interpretation",
  "arrival",
];
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
  if (slug.length === 2 && slug[0] === "services")
    return serviceSlugs.includes(slug[1]);
  if (slug.length === 2 && slug[0] === "guides")
    return guideSlugs.includes(slug[1]);
  return false;
}
