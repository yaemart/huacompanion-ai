import {
  publicPolicy,
  policyTypes,
  validatePolicyPublication,
  type PolicyPublicationData,
  type PublicPolicyData,
} from "./immigration-policy.ts";
import { policyDraft } from "./immigration-policy-draft.ts";
import { assertPolicyCountry } from "./immigration-policy-entry.ts";
import { StaffFormError } from "./staff-form-feedback.ts";
export type SharedPolicyFacts = Omit<
  PolicyPublicationData,
  "publicNotes" | "maxStayDays" | "maxStayHours"
> & {
  maximumStay: number;
  stayUnit: "days" | "hours";
};
const fields = [
  "countryCode",
  "countryNameEn",
  "countryNameZh",
  "policyType",
  "maximumStay",
  "stayUnit",
  "validFrom",
  "validUntil",
  "portsAndRegions",
  "officialSourceUrl",
  "lastVerifiedOn",
  "verifiedBy",
  "internalNotes",
];
function legacy(facts: SharedPolicyFacts): PolicyPublicationData {
  return {
    ...facts,
    maxStayDays: facts.stayUnit === "days" ? facts.maximumStay : null,
    maxStayHours: facts.stayUnit === "hours" ? facts.maximumStay : null,
    publicNotes: "",
  };
}
export function validateSharedFacts(
  value: unknown,
  today: string,
  allowFictional: boolean,
): asserts value is SharedPolicyFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("共用事实格式无效");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !fields.includes(key)))
    throw Error("共用事实不能包含语言说明或未知字段");
  if (data.stayUnit !== (data.policyType === "transit-240h" ? "hours" : "days"))
    throw new StaffFormError("请检查「最长停留」。过境填写小时，其他类型填写天数。");
  assertPolicyCountry(data.countryCode, allowFictional);
  validatePolicyPublication(legacy(data as SharedPolicyFacts), today);
}
/** Fixed public allowlist; language explanations are attached only after their own review. */
export function publicSharedFacts(facts: SharedPolicyFacts): PublicPolicyData {
  return publicPolicy(legacy(facts));
}

export function sharedFactDraft(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("事实草稿格式无效");
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw Error("事实草稿不能包含语言说明或未知字段");
  const { maximumStay, stayUnit, ...draft } = value as Record<string, unknown>;
  if (stayUnit != null && stayUnit !== "days" && stayUnit !== "hours")
    throw new StaffFormError("请重新选择「政策类型」，再按显示的天数或小时填写最长停留。");
  if (draft.policyType != null && !policyTypes.some((type) => type === draft.policyType))
    throw new StaffFormError("请重新选择「政策类型」后再保存。");
  policyDraft({ ...draft, maxStayDays: maximumStay ?? null });
  return structuredClone(value as Record<string, unknown>);
}
