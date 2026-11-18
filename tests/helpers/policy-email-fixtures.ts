import type { Payload } from "payload";
import type { PublicPolicyData } from "../../src/lib/immigration-policy";

export const selectedPolicy: PublicPolicyData = {
  countryCode: "XY",
  countryNameEn: "Fictional email demo country",
  countryNameZh: "虚构测试国家（仅邮件演示）",
  policyType: "unilateral",
  maxStayDays: 30,
  validFrom: "2026-11-01",
  validUntil: "2099-12-31",
  officialSourceUrl: "https://example.invalid/fictional-selected",
  lastVerifiedOn: "2026-11-01",
  publicNotes: "FICTIONAL SELECTED POLICY",
  portsAndRegions: ["Fictional port"],
};
export const otherPolicy: PublicPolicyData = {
  ...selectedPolicy,
  policyType: "bilateral",
  maxStayDays: 15,
  officialSourceUrl: "https://example.invalid/fictional-unselected",
  publicNotes: "FICTIONAL UNSELECTED POLICY",
};

export function publishFictionalMailPolicies(payload: Payload, locale: "zh" | "en") {
  return Promise.all(
    [selectedPolicy, otherPolicy].map((policy, i) =>
      payload.create({
        collection: "content-published",
        data: {
          active: true,
          draftId: -410 - i - (locale === "zh" ? 10 : 0),
          routeKey: `fixture-policy-email:${locale}:${i}`,
          revision: 1,
          body: {
            kind: "immigration-policy",
            locale,
            policy: { ...policy, internalNotes: "TEST PRIVATE STAFF NOTE", verifiedBy: 1 },
          },
          publishedBy: 1,
          publishedAt: new Date().toISOString(),
        },
      }),
    ),
  );
}
