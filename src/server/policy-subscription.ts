import { createHash } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import { publicPolicy, type PublicPolicyData } from "../lib/immigration-policy";
import { policyPageCopy } from "../lib/immigration-policy-page-copy";
import { policyStay } from "../lib/immigration-policy-stay";
import { listPublicPolicies } from "./immigration/public";
import { isSiteLocale } from "./site-config";

export type PolicySelection = { reference: string; locale: "en" | "zh"; privacyVersion: string };
export const isPolicyReference = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function isPolicySelection(value: unknown): value is PolicySelection {
  return (
    !!value &&
    typeof value === "object" &&
    "reference" in value &&
    isPolicyReference(value.reference) &&
    "locale" in value &&
    (value.locale === "en" || value.locale === "zh") &&
    "privacyVersion" in value &&
    typeof value.privacyVersion === "string"
  );
}

export function policyMailReference(locale: PolicySelection["locale"], policy: PublicPolicyData) {
  return createHash("sha256")
    .update(JSON.stringify([locale, publicPolicy(policy)]))
    .digest("hex");
}

export async function publishedPolicySelection(
  payload: Payload,
  selection: PolicySelection,
  contentLock?: Pick<PayloadRequest, "transactionID">,
) {
  if (!isSiteLocale(selection.locale)) return;
  return (await listPublicPolicies(payload, selection.locale, contentLock)).find(
    (policy) => policyMailReference(selection.locale, policy) === selection.reference,
  );
}

export function policyMailBody(policy: PublicPolicyData, locale: PolicySelection["locale"]) {
  const c = policyPageCopy[locale];
  const stay = policyStay(policy);
  const conditions = policy.portsAndRegions.join("\n");
  return [
    `${locale === "zh" ? policy.countryNameZh : policy.countryNameEn} · ${c.methods[policy.policyType]}`,
    `${c.stay}: ${stay.maximum} ${c.units[stay.unit]}`,
    `${c.window}: ${c.from} ${policy.validFrom} · ${policy.validUntil ? `${c.until} ${policy.validUntil}` : c.noExpiry}`,
    `${c.verified}: ${policy.lastVerifiedOn}`,
    `${c.sourceLink}: ${policy.officialSourceUrl}`,
    policy.publicNotes,
    conditions.length <= 12000
      ? conditions
      : locale === "zh"
        ? "完整口岸条件请查阅上方官方来源。"
        : "See the official source above for all port conditions.",
    c.disclaimer,
  ]
    .filter(Boolean)
    .join("\n\n");
}
