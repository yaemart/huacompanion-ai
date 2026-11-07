import {
  isPolicyCalendarDate,
  publicPolicy,
  validatePublicPolicy,
  type PublicPolicyData,
} from "./immigration-policy.ts";
import {
  comparePublicPolicies,
  queryImmigrationPolicies,
  type PolicyQueryMatch,
} from "./immigration-policy-query.ts";

export type PolicyTableRow = {
  policy: PolicyQueryMatch;
  dateStatus: "within-dates" | "upcoming" | "unconfirmed";
};

/** Complete formal reference, including expired/future windows; no visitor inputs. */
export function buildPolicyTable(
  policies: readonly unknown[],
  verifiedOnOrBefore: string,
): PolicyTableRow[] {
  if (!isPolicyCalendarDate(verifiedOnOrBefore)) throw Error("核实日期基准无效");
  const entries: { source: PublicPolicyData; row: PolicyTableRow }[] = [];
  for (const candidate of policies) {
    try {
      validatePublicPolicy(candidate, verifiedOnOrBefore);
      const policy = queryImmigrationPolicies(
        { nationalityISO: candidate.countryCode, arrivalDate: candidate.validFrom },
        [candidate],
        { verifiedOnOrBefore, visaGuide: null },
      ).matches[0];
      if (!policy) continue;
      entries.push({
        source: publicPolicy(candidate),
        row: {
          policy,
          dateStatus:
            verifiedOnOrBefore < policy.validFrom
              ? "upcoming"
              : policy.validUntil && verifiedOnOrBefore > policy.validUntil
                ? "unconfirmed"
                : "within-dates",
        },
      });
    } catch {
      // Malformed data must not become a statement about entry eligibility.
    }
  }
  return entries
    .sort((a, b) => {
      const left = a.source.countryCode;
      const right = b.source.countryCode;
      return left < right ? -1 : left > right ? 1 : comparePublicPolicies(a.source, b.source);
    })
    .map((entry) => entry.row);
}
