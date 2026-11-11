import type { Block } from "./content-model.ts";
import type { PublicPolicyData } from "./immigration-policy.ts";
import { parsePolicyBannerBlock } from "./immigration-policy-banner.ts";
import { policyPageCopy } from "./immigration-policy-page-copy.ts";

type ChoiceFields = Pick<
  PublicPolicyData,
  "countryCode" | "countryNameZh" | "countryNameEn" | "policyType" | "validFrom" | "validUntil"
>;
export type PolicyBannerChoice = ChoiceFields & { key: string };
export type PolicyBannerLocale = "zh" | "en";
export const isPolicyBannerLocale = (locale: unknown): locale is PolicyBannerLocale =>
  locale === "zh" || locale === "en";

export function policyBannerChoice(key: string, policy: ChoiceFields): PolicyBannerChoice {
  const { countryCode, countryNameZh, countryNameEn, policyType, validFrom, validUntil } = policy;
  return { key, countryCode, countryNameZh, countryNameEn, policyType, validFrom, validUntil };
}

const normalizeSearch = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s-]+/g, "");

export function filterPolicyBannerChoices(choices: readonly PolicyBannerChoice[], query: string) {
  const terms = query.split(/\s+/).map(normalizeSearch).filter(Boolean);
  return choices.filter(({ countryCode, countryNameZh, countryNameEn, policyType }) => {
    const names = [
      countryCode,
      countryNameZh,
      countryNameEn,
      policyType,
      policyPageCopy.zh.methods[policyType],
      policyPageCopy.en.methods[policyType],
    ];
    return terms.every((term) => names.some((name) => normalizeSearch(name).includes(term)));
  });
}

export function newPolicyBannerKeys(before: readonly Block[], after: readonly Block[]) {
  const remaining = new Map<string, number>();
  for (const block of before) {
    const ref = parsePolicyBannerBlock(block);
    if (ref) remaining.set(ref.key, (remaining.get(ref.key) ?? 0) + 1);
  }
  const added = new Set<string>();
  for (const block of after) {
    const ref = parsePolicyBannerBlock(block);
    if (!ref) continue;
    const count = remaining.get(ref.key) ?? 0;
    if (count) remaining.set(ref.key, count - 1);
    else added.add(ref.key);
  }
  return [...added];
}
