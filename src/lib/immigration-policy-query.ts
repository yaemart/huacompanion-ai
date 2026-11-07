import {
  isPolicyCalendarDate,
  publicPolicy,
  validatePublicPolicy,
  type PublicPolicyData,
} from "./immigration-policy.ts";
import { policyQueryCopy } from "./immigration-policy-query-copy.ts";

type QueryStatus = keyof typeof policyQueryCopy.notices;
type QueryWarning = keyof typeof policyQueryCopy.warnings;
type QueryField = "nationalityISO" | "arrivalDate";
type VisaGuide = { href: string; title: string };

export type PolicyQueryMatch = Omit<PublicPolicyData, "maxStayDays"> & {
  stay: { unit: "days"; maximum: number } | { unit: "hours"; maximum: 240 };
  warnings: QueryWarning[];
};

export type PolicyQueryResult = {
  status: QueryStatus;
  errors: QueryField[];
  notice: { en: string; zh: string };
  matches: PolicyQueryMatch[];
  visaGuide: VisaGuide | null;
};

const priority: Record<PublicPolicyData["policyType"], number> = {
  unilateral: 0,
  bilateral: 1,
  other: 2,
  "transit-240h": 3,
};

export function safeVisaGuide(value: unknown): VisaGuide | null {
  if (!value || typeof value !== "object") return null;
  const guide = value as Record<string, unknown>;
  if (
    typeof guide.href !== "string" ||
    !/^\/(en|zh)\/guides\/[a-z0-9][a-z0-9-]{0,99}$/.test(guide.href) ||
    typeof guide.title !== "string" ||
    !guide.title.trim() ||
    guide.title.length > 200
  )
    return null;
  return { href: guide.href, title: guide.title };
}

export function cleanPublicPolicy(
  value: unknown,
  verifiedOnOrBefore: string,
): PublicPolicyData | null {
  try {
    validatePublicPolicy(value, verifiedOnOrBefore);
    const clean = publicPolicy(value);
    // Only accept the public projection, never a master/draft/workflow record by mistake.
    if (Object.keys(value).some((key) => !Object.hasOwn(clean, key))) return null;
    return clean;
  } catch {
    return null;
  }
}

export function comparePublicPolicies(a: PublicPolicyData, b: PublicPolicyData): number {
  const rank = priority[a.policyType] - priority[b.policyType];
  if (rank) return rank;
  if (a.lastVerifiedOn !== b.lastVerifiedOn) return a.lastVerifiedOn > b.lastVerifiedOn ? -1 : 1;
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function match(policy: PublicPolicyData): PolicyQueryMatch {
  const { maxStayDays, ...fields } = policy;
  const warnings: QueryWarning[] = ["conditions-unchecked"];
  if (policy.validUntil == null) warnings.push("expiry-not-stated");
  if (policy.policyType === "transit-240h") warnings.push("transit-itinerary-unchecked");
  return {
    ...fields,
    stay:
      policy.policyType === "transit-240h"
        ? { unit: "hours", maximum: 240 }
        : { unit: "days", maximum: maxStayDays },
    warnings,
  };
}

/**
 * Pure local query: the caller supplies listPublicPolicies results and a guide from listPublished.
 * A plain policy object cannot prove publication; the server projection remains the authority.
 * No implicit clock, request, persistence, visitor-input echo or departure-date calculation.
 */
export function queryImmigrationPolicies(
  input: { nationalityISO: unknown; arrivalDate: unknown },
  policies: readonly unknown[],
  context: { verifiedOnOrBefore: string; visaGuide: unknown },
): PolicyQueryResult {
  if (!isPolicyCalendarDate(context.verifiedOnOrBefore)) throw Error("核实日期基准无效");
  if (!Array.isArray(policies)) throw Error("公开政策列表格式无效");
  const nationality =
    typeof input.nationalityISO === "string"
      ? input.nationalityISO.trim().toUpperCase()
      : input.nationalityISO;
  const errors: QueryField[] = [];
  if (
    nationality !== null &&
    (typeof input.nationalityISO !== "string" || !/^[A-Za-z]{2}$/.test(input.nationalityISO.trim()))
  )
    errors.push("nationalityISO");
  const arrivalDate = input.arrivalDate;
  if (!isPolicyCalendarDate(arrivalDate)) errors.push("arrivalDate");
  const matches: PolicyQueryMatch[] = [];
  if (!errors.length && typeof arrivalDate === "string" && nationality !== null) {
    const applicable: PublicPolicyData[] = [];
    for (const candidate of policies) {
      const policy = cleanPublicPolicy(candidate, context.verifiedOnOrBefore);
      if (
        policy &&
        policy.countryCode === nationality &&
        policy.validFrom <= arrivalDate &&
        (policy.validUntil == null || arrivalDate <= policy.validUntil)
      )
        applicable.push(policy);
    }
    matches.push(...applicable.sort(comparePublicPolicies).map(match));
  }
  const status: QueryStatus = errors.length
    ? "invalid-input"
    : matches.length
      ? "matched"
      : "unconfirmed";
  return {
    status,
    errors,
    notice: { ...policyQueryCopy.notices[status] },
    matches,
    visaGuide: safeVisaGuide(context.visaGuide),
  };
}
