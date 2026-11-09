export const defaultInquiryReplies = {
  zh: "我们会在 1 个工作日内（北京时间）通过邮件回复您。",
  en: "We will reply by email within 1 business day (Beijing time).",
};
export function publicInquiryReplies(settings: unknown): { zh: string; en: string } {
  const source =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const text = (key: string, fallback: string) => {
    const value = source[key];
    return typeof value === "string" && value.trim() && value.length <= 500
      ? value.trim()
      : fallback;
  };
  return {
    zh: text("inquiryReplyZh", defaultInquiryReplies.zh),
    en: text("inquiryReplyEn", defaultInquiryReplies.en),
  };
}
