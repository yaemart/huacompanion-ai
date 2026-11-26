import type { ContentBody } from "./content-model.ts";
import { isContentIdentifier } from "./content-identifiers.ts";
import { effectiveExhibitionStatus, shanghaiToday, type Exhibition } from "./exhibitions.ts";
import { isLocale } from "./locales.ts";

export type ExhibitionSubscriptionTarget = Pick<
  ContentBody,
  "kind" | "locale" | "contentKey" | "slug" | "title"
> & { exhibition?: Pick<Exhibition, "status" | "endDate"> };

export function isExhibitionSubscribable(
  body: ExhibitionSubscriptionTarget | undefined,
  locale: string,
  today = shanghaiToday(),
) {
  return !!(
    body?.kind === "exhibition" &&
    body.locale === locale &&
    isLocale(locale) &&
    isContentIdentifier(body.contentKey) &&
    body.exhibition &&
    ["pending", "announced", "postponed"].includes(
      effectiveExhibitionStatus(body.exhibition, today),
    )
  );
}

export function validExhibitionSubscriptionRequest(input: Record<string, unknown>) {
  if (!Object.hasOwn(input, "exhibitionKey")) return true;
  return (
    isContentIdentifier(input.exhibitionKey) &&
    input.topic === `exhibition:${input.exhibitionKey}` &&
    (input.locale === "zh" || input.locale === "en") &&
    Object.keys(input).every((key) =>
      [
        "email",
        "topic",
        "locale",
        "sourcePath",
        "privacyVersion",
        "consent",
        "contactFax",
        "partnerCode",
        "exhibitionKey",
      ].includes(key),
    )
  );
}
