export type Locale = "en" | "zh";
export const serviceSlugs = [
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
  return path.replace(/^\/(en|zh)(?=\/|$)/, `/${locale}`);
}
export function isKnownRoute(slug: string[]): boolean {
  if (!slug.length) return true;
  if (slug.length === 1)
    return [
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
