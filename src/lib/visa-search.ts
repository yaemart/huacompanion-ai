import type { Locale } from "./locales.ts";

export const visaToolPath = "tools/china-visa-free-checker";
export function toolLocales(active: readonly Locale[], enabled: boolean): ("en" | "zh")[] {
  return enabled
    ? active.filter((locale): locale is "en" | "zh" => locale === "en" || locale === "zh")
    : [];
}
export function toolAlternates(origin: string, active: readonly Locale[], enabled: boolean) {
  const available = toolLocales(active, enabled);
  const languages: Record<string, string> = Object.fromEntries(
    available.map((locale) => [
      locale === "zh" ? "zh-CN" : locale,
      `${origin}/${locale}/${visaToolPath}`,
    ]),
  );
  if (available.length)
    languages["x-default"] =
      `${origin}/${available.includes("en") ? "en" : available[0]}/${visaToolPath}`;
  return languages;
}
export function verificationToken(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value))
    throw Error("Google 验证码只能填写字母、数字、下划线和连字符，不要粘贴 HTML 或网址");
  return value;
}
