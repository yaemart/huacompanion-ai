import type { ContentBody } from "./content-model.ts";
import { isPolicyCalendarDate } from "./immigration-policy.ts";

export type PolicyFAQItem = {
  key: string;
  question: string;
  answer: string;
  sources: { title: string; url: string; checkedAt: string }[];
};

/** Caller supplies listPublished; raw objects cannot prove publication. */
export function selectPolicyFAQs(
  published: readonly ContentBody[],
  locale: "en" | "zh",
  keys: string | undefined,
  asOf: string,
): PolicyFAQItem[] {
  if (!keys?.trim() || !isPolicyCalendarDate(asOf)) return [];
  const result: PolicyFAQItem[] = [];
  for (const key of new Set(
    keys
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )) {
    const matches = published.filter(
      (body) => body.contentKey === key && body.locale === locale && body.kind === "faq",
    );
    if (matches.length !== 1) continue;
    const body = matches[0];
    if (!body.title.trim() || !body.blocks.length || !body.sources.length) continue;
    if (
      body.blocks.some(
        (block) => !["paragraph", "heading", "list"].includes(block.type) || !block.text?.trim(),
      )
    )
      continue;
    const checkedSources: PolicyFAQItem["sources"] = [];
    for (const source of body.sources) {
      try {
        const url = new URL(source.url);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          !source.title.trim() ||
          !isPolicyCalendarDate(source.checkedAt) ||
          source.checkedAt > asOf
        )
          break;
        checkedSources.push({ title: source.title, url: source.url, checkedAt: source.checkedAt });
      } catch {
        break;
      }
    }
    if (checkedSources.length !== body.sources.length) continue;
    result.push({
      key,
      question: body.title,
      answer: body.blocks.map((block) => block.text).join("\n\n"),
      sources: checkedSources,
    });
  }
  return result;
}
