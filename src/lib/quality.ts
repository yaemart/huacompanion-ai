import { validateInstitution } from "./institutions.ts";
import { validateExhibition } from "./exhibitions.ts";
import { validateCatalog } from "./catalog.ts";
import { validateLifestyle } from "./lifestyle.ts";
import { locales, type Locale } from "./locales.ts";
/** Canonical content identity: excludes workflow status, timestamps and revision counters. */
export function contentVersion(body: unknown): string {
  const stable = (v: any): any =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return JSON.stringify(stable(body));
}
export function completeness(body: any) {
  const missing: string[] = [];
  for (const field of ["title", "summary"]) if (!body?.[field]?.trim()) missing.push(field);
  if (!body?.blocks?.length) missing.push("blocks");
  if (!body?.sources?.length) missing.push("sources");
  const special: Record<string, string> = {
    "provider-profile": "catalog",
    "service-project": "catalog",
    exhibition: "exhibition",
    institution: "institution",
    venue: "lifestyle",
    activity: "lifestyle",
  };
  const field = special[body?.kind];
  if (field)
    try {
      if (field === "catalog") validateCatalog(body.kind, body.catalog);
      if (field === "institution") validateInstitution(body.institution);
      if (field === "exhibition") validateExhibition(body.exhibition);
      if (field === "lifestyle") validateLifestyle(body.lifestyle, body.kind);
    } catch {
      missing.push(field);
    }
  return { missing, complete: missing.length === 0 };
}
export function translationCoverage(drafts: any[]) {
  return Object.fromEntries(
    locales.map((locale) => {
      const d = drafts.find((d) => d.locale === locale);
      if (!d) return [locale, "missing"];
      if (!d.sourceDraft) return [locale, "independent"];
      const source = drafts.find((s) => String(s.id) === String(d.sourceDraft));
      return [
        locale,
        !source || d.sourceRevision !== source.revision ? "review-needed" : "current",
      ];
    }),
  ) as Record<Locale, "missing" | "independent" | "review-needed" | "current">;
}
export function validateQualityReview(input: any, body: any, now = new Date()) {
  if (typeof input?.reason !== "string" || !input.reason.trim() || input.reason.length > 2000)
    throw Error("请填写复核依据");
  if (
    !Array.isArray(input.sourceIds) ||
    !input.sourceIds.length ||
    input.sourceIds.length > 30 ||
    input.sourceIds.some(
      (id: unknown) => typeof id !== "string" || !body.sources?.some((s: any) => s.id === id),
    )
  )
    throw Error("请选择本稿已有来源");
  const date = Date.parse(input.nextReviewAt);
  if (!Number.isFinite(date) || date <= now.getTime()) throw Error("下次复核时间必须晚于当前时间");
}
export function publicQualityMetadata(
  meta: any,
  publishedRevision: number,
): { checkedAt?: string; nextReviewAt?: string } {
  if (
    meta?.state !== "checked" ||
    meta.checkedRevision !== publishedRevision ||
    !Number.isFinite(Date.parse(meta.checkedAt))
  )
    return {};
  return {
    checkedAt: meta.checkedAt,
    ...(Number.isFinite(Date.parse(meta.nextReviewAt)) ? { nextReviewAt: meta.nextReviewAt } : {}),
  };
}
const labels: Record<Locale, { checked: string; due: string }> = {
  zh: { checked: "信息复核时间", due: "信息待复核" },
  en: { checked: "Information reviewed", due: "Information due for review" },
  es: { checked: "Información revisada", due: "Información pendiente de revisión" },
  fr: { checked: "Informations revues", due: "Informations à revoir" },
  de: { checked: "Informationen geprüft", due: "Informationen zur Prüfung fällig" },
  it: { checked: "Informazioni riesaminate", due: "Informazioni da riesaminare" },
  ar: { checked: "تاريخ مراجعة المعلومات", due: "المعلومات بحاجة إلى مراجعة" },
};
export function qualityStatusLabel(
  locale: Locale,
  meta: { checkedAt?: string; nextReviewAt?: string },
  now = new Date(),
) {
  if (!meta.checkedAt) return "";
  return meta.nextReviewAt && Date.parse(meta.nextReviewAt) <= now.getTime()
    ? labels[locale].due
    : `${labels[locale].checked}: ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(meta.checkedAt))}`;
}
