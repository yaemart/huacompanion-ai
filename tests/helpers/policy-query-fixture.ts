import type { PublicPolicyData } from "../../src/lib/immigration-policy.ts";

/** Synthetic facts only; never a statement about a real nationality or policy. */
export function queryPolicy(overrides: Partial<PublicPolicyData> = {}): PublicPolicyData {
  return {
    countryCode: "XY",
    countryNameEn: "Fictional country",
    countryNameZh: "虚构国家",
    policyType: "unilateral",
    maxStayDays: 3,
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    portsAndRegions: ["Fictional port condition"],
    officialSourceUrl: "https://example.invalid/policy",
    lastVerifiedOn: "2026-01-01",
    publicNotes: "Fictional purpose and passport conditions",
    ...overrides,
  };
}

export const queryContext = {
  verifiedOnOrBefore: "2026-11-01",
  visaGuide: { href: "/en/guides/fictional-visa-guide", title: "Fictional visa guide" },
};
