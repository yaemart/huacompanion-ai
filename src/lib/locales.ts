export const locales = ["zh", "en", "es", "fr", "de", "it", "ar"] as const;
export type Locale = (typeof locales)[number];
export const localeNames: Record<Locale,string> = {zh:"中文",en:"English",es:"Español",fr:"Français",de:"Deutsch",it:"Italiano",ar:"العربية"};
export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);
export const localeDirection = (locale: string) => locale === "ar" ? "rtl" : "ltr";
