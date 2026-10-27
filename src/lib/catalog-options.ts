export const catalogCities = [
  { code: "shanghai", zh: "上海", en: "Shanghai" },
  { code: "beijing", zh: "北京", en: "Beijing" },
  { code: "guangzhou", zh: "广州", en: "Guangzhou" },
  { code: "shenzhen", zh: "深圳", en: "Shenzhen" },
  { code: "chongqing", zh: "重庆", en: "Chongqing" },
  { code: "hangzhou", zh: "杭州", en: "Hangzhou" },
  { code: "wuhan", zh: "武汉", en: "Wuhan" },
  { code: "nanjing", zh: "南京", en: "Nanjing" },
] as const;
export const catalogLanguages = [
  { code: "zh", zh: "中文", en: "Chinese" },
  { code: "en", zh: "英文", en: "English" },
] as const;
export const cityLabel = (code: string, locale: "zh" | "en") =>
  catalogCities.find((c) => c.code === code)?.[locale] || code;
export const languageLabel = (code: string, locale: "zh" | "en") =>
  catalogLanguages.find((l) => l.code === code)?.[locale] || code;
