import { isLocale, type Locale } from "./locales.ts";

/** Public language policy; editorial tools retain every supported locale. */
export function parseSiteLocales(value: string | undefined): Locale[] {
  if (value === undefined) return ["en", "zh"];
  const configured = value.split(",").map((locale) => locale.trim());
  if (
    configured.some((locale) => !isLocale(locale)) ||
    new Set(configured).size !== configured.length ||
    !configured.includes("zh") ||
    !configured.includes("en")
  )
    throw new Error("SITE_LOCALES must contain unique supported locales including zh and en");
  return configured as Locale[];
}

export type PublicFeatures = { customerCenter: boolean; textChat: boolean };
export function publicFeatures(
  customer: { enabled?: unknown } | undefined,
  support: { textChat?: unknown } | undefined,
): PublicFeatures {
  return { customerCenter: customer?.enabled === true, textChat: support?.textChat === true };
}
