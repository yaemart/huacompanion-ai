import type { ContentDraft } from "../../payload-types";
import type { ContentBody } from "./content-model";
import { sectionFor } from "./content-sections.ts";

export type GuideLocale = "zh" | "en";
export type GuideTranslation = {
  source: ContentDraft;
  target: ContentDraft | null;
  locale: GuideLocale;
};

export function guideTargetLocale(locale: string): GuideLocale | null {
  if (locale === "zh") return "en";
  if (locale === "en") return "zh";
  return null;
}

export function prefillGuideTranslation(
  source: Pick<ContentDraft, "contentKey" | "body">,
  locale: GuideLocale,
): ContentBody {
  const body = source.body as ContentBody;
  return {
    kind: "guide",
    locale,
    contentKey: source.contentKey,
    slug: "",
    title: "",
    blocks: [],
    category: sectionFor(body),
    order: body.order,
    sources: body.sources.map(({ id, title, url, checkedAt }) => ({ id, title, url, checkedAt })),
  };
}
