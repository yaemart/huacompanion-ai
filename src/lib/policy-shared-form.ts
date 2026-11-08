import { policyForm, policyFormInput, type PolicyForm } from "./immigration-policy-editor.ts";
import { policyDraft } from "./immigration-policy-draft.ts";
import { sharedFactDraft } from "./policy-shared-facts.ts";
export function sharedPolicyForm(value: unknown = {}): PolicyForm {
  const { maximumStay, stayUnit, ...facts } = sharedFactDraft(value);
  const parsed = policyDraft({
    ...facts,
    maxStayDays: stayUnit === "days" ? (maximumStay ?? null) : null,
    maxStayHours: stayUnit === "hours" ? (maximumStay ?? null) : null,
  });
  return policyForm(parsed);
}
export function sharedPolicyInput(form: PolicyForm) {
  const { maxStayDays, maxStayHours, ...facts } = policyFormInput(form);
  delete facts.publicNotes;
  const hours = form.policyType === "transit-240h";
  return {
    ...facts,
    maximumStay: (hours ? maxStayHours : maxStayDays) ?? null,
    stayUnit: hours ? "hours" : "days",
  };
}
