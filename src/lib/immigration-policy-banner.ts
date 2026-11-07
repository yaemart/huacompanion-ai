import { isPolicyCalendarDate, type PublicPolicyData } from "./immigration-policy.ts";
import { cleanPublicPolicy } from "./immigration-policy-query.ts";

export type PolicyBannerState = {
  status: "expiring" | "extended" | "unconfirmed";
  policy: PublicPolicyData | null;
  previous: PublicPolicyData | null;
};
export function parsePolicyBannerBlock(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  if (
    block.type !== "policy-banner" ||
    typeof block.text !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(block.text) ||
    (block.policyUnconfirmed !== undefined && typeof block.policyUnconfirmed !== "boolean")
  )
    return null;
  return { key: block.text, unconfirmed: block.policyUnconfirmed === true };
}
export function derivePolicyBanner(
  current: unknown,
  previous: unknown,
  asOf: string,
  forced = false,
): PolicyBannerState | null {
  if (!isPolicyCalendarDate(asOf)) throw Error("政策状态日期无效");
  const policy = cleanPublicPolicy(current, asOf);
  const unknown: PolicyBannerState = { status: "unconfirmed", policy, previous: null };
  if (
    !policy ||
    forced ||
    policy.validFrom > asOf ||
    !policy.validUntil ||
    policy.validUntil < asOf
  )
    return unknown;
  const days = (Date.parse(policy.validUntil) - Date.parse(asOf)) / 86400000;
  if (days <= 30) return { status: "expiring", policy, previous: null };
  const old = cleanPublicPolicy(previous, asOf);
  if (
    old?.validUntil &&
    policy.validUntil > old.validUntil &&
    policy.countryCode === old.countryCode &&
    policy.policyType === old.policyType &&
    policy.validFrom === old.validFrom &&
    policy.lastVerifiedOn >= old.lastVerifiedOn
  )
    return { status: "extended", policy, previous: old };
  return null;
}
