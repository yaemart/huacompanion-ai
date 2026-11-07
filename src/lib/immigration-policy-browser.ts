import type { ContentBody } from "./content-model.ts";
import { buildPolicyTable } from "./immigration-policy-table.ts";
import { safeVisaGuide } from "./immigration-policy-query.ts";

export function policyCountryOptions(
  policies: readonly unknown[],
  asOf: string,
  locale: "en" | "zh",
) {
  const countries = new Map<string, { value: string; label: string }>();
  for (const { policy } of buildPolicyTable(policies, asOf)) {
    const value = policy.countryCode;
    const name = locale === "zh" ? policy.countryNameZh : policy.countryNameEn;
    if (!countries.has(value)) countries.set(value, { value, label: `${name} (${value})` });
  }
  return [...countries.values()];
}

/** Caller supplies listPublished, never working drafts or raw collection records. */
export function selectPolicyVisaGuide(
  published: readonly ContentBody[],
  locale: "en" | "zh",
  contentKey: string | undefined,
) {
  if (!contentKey?.trim()) return null;
  const candidates = published.filter(
    (row) => row.kind === "guide" && row.locale === locale && row.contentKey === contentKey.trim(),
  );
  if (candidates.length !== 1) return null;
  return safeVisaGuide({
    href: `/${locale}/guides/${candidates[0].slug}`,
    title: candidates[0].title,
  });
}
