export const replyCategories = [
  { value: "inquiry", label: "咨询回复" },
  { value: "quote", label: "报价说明" },
  { value: "confirmation", label: "服务确认" },
] as const;

export type ReplyCategory = (typeof replyCategories)[number]["value"];
export type ReplyLanguage = "zh" | "en";
export type ReplyTemplate = {
  id: number;
  category: ReplyCategory;
  title: string;
  bodyZh: string;
  bodyEn: string;
};

export function replyTemplateBody(
  template: Pick<ReplyTemplate, "bodyZh" | "bodyEn">,
  locale: ReplyLanguage,
) {
  return locale === "en" ? template.bodyEn : template.bodyZh;
}
