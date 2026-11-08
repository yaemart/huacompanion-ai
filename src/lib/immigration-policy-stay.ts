import type { PolicyForm } from "./immigration-policy-editor.ts";
import type { PublicPolicyData } from "./immigration-policy.ts";
const allPorts = "所有对外国人开放的口岸";
export function changePolicyType(
  value: PolicyForm,
  policyType: PolicyForm["policyType"],
): PolicyForm {
  if (value.policyType === policyType) return value;
  const custom = value.portsAndRegions.filter((line) => line.trim() && line.trim() !== allPorts);
  return {
    ...value,
    policyType,
    maxStayDays: policyType === "unilateral" ? 30 : null,
    maxStayHours: policyType === "transit-240h" ? 240 : null,
    portsAndRegions: custom.length ? custom : policyType === "unilateral" ? [allPorts] : [],
  };
}
/** An explicit hour edit replaces the legacy day value, including clearing an unknown duration. */
export function changePolicyHours(value: PolicyForm, maxStayHours: number | null): PolicyForm {
  return { ...value, maxStayDays: null, maxStayHours };
}
/** Old transit snapshots already meant 240 hours; never multiply their legacy days. */
export function policyStay(
  policy: Pick<PublicPolicyData, "policyType" | "maxStayDays" | "maxStayHours">,
): { unit: "days" | "hours"; maximum: number } {
  return policy.policyType === "transit-240h"
    ? { unit: "hours", maximum: policy.maxStayHours ?? 240 }
    : { unit: "days", maximum: policy.maxStayDays! };
}
