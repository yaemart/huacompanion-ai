import { contentSections, sectionFor } from "./content-sections.ts";
import { isPolicyCalendarDate } from "./immigration-policy.ts";

export const sourceTopics = { policy: "政策", medical: "就医", visa: "签证" } as const;
export type SourceTopic = keyof typeof sourceTopics;

export function isSourceTopic(value: unknown): value is SourceTopic {
  return typeof value === "string" && Object.hasOwn(sourceTopics, value);
}

export function visaSourceKeys(env: Record<string, string | undefined>) {
  return {
    guide: env.VISA_GUIDE_CONTENT_KEY?.trim(),
    faq: (env.VISA_FAQ_CONTENT_KEYS || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  };
}

export type VisaSourceKeys = ReturnType<typeof visaSourceKeys>;

type SourceContent = {
  kind: string;
  sourceTopic?: SourceTopic;
  category?: number;
  contentKey?: string;
  slug?: string;
  institution?: { type: string };
  catalog?: { categories: string[] };
};

const medicalSection = contentSections.find(({ key }) => key === "medical")!.id;

export function requiresSourceDates(body: SourceContent, keys: VisaSourceKeys) {
  // Structured policy facts already validate their own official source and verification date.
  if (body.kind === "immigration-policy") return false;
  return (
    isSourceTopic(body.sourceTopic) ||
    sectionFor(body) === medicalSection ||
    (body.kind === "institution" && body.institution?.type === "medical") ||
    (body.kind === "service" &&
      (body.slug === "medical" || body.contentKey === "service-medical")) ||
    ((body.kind === "service-project" || body.kind === "provider-profile") &&
      body.catalog?.categories.includes("medical")) ||
    (body.kind === "guide" &&
      (body.slug === "medical-visit-process" ||
        body.contentKey === "guide-medical-visit-process" ||
        body.contentKey === "knowledge-verify-entry-information" ||
        (!!keys.guide && body.contentKey === keys.guide))) ||
    (body.kind === "faq" &&
      !!body.contentKey &&
      (body.contentKey === "faq-4" || keys.faq.includes(body.contentKey)))
  );
}

export function sourceDateIssue(
  body: SourceContent & { sources: readonly { checkedAt?: string }[] },
  keys: VisaSourceKeys,
  today: string,
): string | undefined {
  if (!requiresSourceDates(body, keys)) return;
  if (!body.sources.length) return "请在「资料来源」添加至少一条来源，并填写人工核实日期。";
  for (const [index, source] of body.sources.entries()) {
    const label = `第 ${index + 1} 条来源的人工核实日期`;
    if (!source.checkedAt) return `请填写${label}。`;
    if (!isPolicyCalendarDate(source.checkedAt)) return `${label}须为有效日期（年-月-日）。`;
    if (source.checkedAt > today) return `${label}不能晚于今天（北京时间）。`;
  }
}
