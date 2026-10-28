import type { Locale } from "./locales.ts";
export const catalogCities = [
  {
    "code": "shanghai",
    "zh": "上海",
    "en": "Shanghai",
    "es": "Shanghái",
    "fr": "Shanghai",
    "de": "Shanghai",
    "it": "Shanghai",
    "ar": "شنغهاي"
  },
  {
    "code": "beijing",
    "zh": "北京",
    "en": "Beijing",
    "es": "Pekín",
    "fr": "Pékin",
    "de": "Peking",
    "it": "Pechino",
    "ar": "بكين"
  },
  {
    "code": "guangzhou",
    "zh": "广州",
    "en": "Guangzhou",
    "es": "Cantón",
    "fr": "Canton",
    "de": "Guangzhou",
    "it": "Canton",
    "ar": "غوانغجو"
  },
  {
    "code": "shenzhen",
    "zh": "深圳",
    "en": "Shenzhen",
    "es": "Shenzhen",
    "fr": "Shenzhen",
    "de": "Shenzhen",
    "it": "Shenzhen",
    "ar": "شنتشن"
  },
  {
    "code": "chongqing",
    "zh": "重庆",
    "en": "Chongqing",
    "es": "Chongqing",
    "fr": "Chongqing",
    "de": "Chongqing",
    "it": "Chongqing",
    "ar": "تشونغتشينغ"
  },
  {
    "code": "hangzhou",
    "zh": "杭州",
    "en": "Hangzhou",
    "es": "Hangzhou",
    "fr": "Hangzhou",
    "de": "Hangzhou",
    "it": "Hangzhou",
    "ar": "هانغتشو"
  },
  {
    "code": "wuhan",
    "zh": "武汉",
    "en": "Wuhan",
    "es": "Wuhan",
    "fr": "Wuhan",
    "de": "Wuhan",
    "it": "Wuhan",
    "ar": "ووهان"
  },
  {
    "code": "nanjing",
    "zh": "南京",
    "en": "Nanjing",
    "es": "Nankín",
    "fr": "Nankin",
    "de": "Nanjing",
    "it": "Nanchino",
    "ar": "نانجينغ"
  }
] as const;
export const catalogLanguages = [
  {
    "code": "zh",
    "zh": "中文",
    "en": "Chinese",
    "es": "Chino",
    "fr": "Chinois",
    "de": "Chinesisch",
    "it": "Cinese",
    "ar": "الصينية"
  },
  {
    "code": "en",
    "zh": "英文",
    "en": "English",
    "es": "Inglés",
    "fr": "Anglais",
    "de": "Englisch",
    "it": "Inglese",
    "ar": "الإنجليزية"
  },
  {
    "code": "es",
    "zh": "西班牙文",
    "en": "Spanish",
    "es": "Español",
    "fr": "Espagnol",
    "de": "Spanisch",
    "it": "Spagnolo",
    "ar": "الإسبانية"
  },
  {
    "code": "fr",
    "zh": "法文",
    "en": "French",
    "es": "Francés",
    "fr": "Français",
    "de": "Französisch",
    "it": "Francese",
    "ar": "الفرنسية"
  },
  {
    "code": "de",
    "zh": "德文",
    "en": "German",
    "es": "Alemán",
    "fr": "Allemand",
    "de": "Deutsch",
    "it": "Tedesco",
    "ar": "الألمانية"
  },
  {
    "code": "it",
    "zh": "意大利文",
    "en": "Italian",
    "es": "Italiano",
    "fr": "Italien",
    "de": "Italienisch",
    "it": "Italiano",
    "ar": "الإيطالية"
  },
  {
    "code": "ar",
    "zh": "阿拉伯文",
    "en": "Arabic",
    "es": "Árabe",
    "fr": "Arabe",
    "de": "Arabisch",
    "it": "Arabo",
    "ar": "العربية"
  }
] as const;
export const cityLabel = (code: string, locale: Locale) => catalogCities.find(c => c.code === code)?.[locale] || code;
export const languageLabel = (code: string, locale: Locale) => catalogLanguages.find(l => l.code === code)?.[locale] || code;
