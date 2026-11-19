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

export async function publishFictionalSharedMailPolicy(
  payload: Payload,
  policy: PublicPolicyData,
  contentKey = `fixture-mail-${policy.policyType}`,
) {
  const { maxStayDays, maxStayHours, publicNotes, ...facts } = policy;
  const group = await payload.create({
    collection: "policy-groups",
    data: { contentKey, revision: 1 },
  });
  const revision = {
    group: group.id,
    revision: 1,
    sourceRevision: 1,
    contributors: [1],
    approvedBy: 1,
  };
  const fact = await payload.create({
    collection: "policy-fact-versions",
    data: {
      ...revision,
      facts: {
        ...facts,
        maximumStay: maxStayDays ?? maxStayHours,
        stayUnit: maxStayHours == null ? "days" : "hours",
        verifiedBy: 1,
        internalNotes: "TEST PRIVATE STAFF NOTE",
      },
    },
  });
  const note = {
    locale: "zh",
    title: policy.countryNameZh,
    slug: contentKey,
    basedOnFactVersion: fact.id,
    publicNotes,
  };
  const published = await payload.create({
    collection: "policy-note-versions",
    data: { ...revision, ...note },
  });
  await payload.create({
    collection: "policy-note-drafts",
    data: {
      group: group.id,
      revision: 1,
      ...note,
      reviewState: "approved",
      needsReview: false,
      publishedNoteVersion: published.id,
    },
  });
  await payload.update({
    collection: "policy-groups",
    id: group.id,
    data: { activeFactVersion: fact.id },
  });
  return { group: group.id, fact: fact.id };
}
