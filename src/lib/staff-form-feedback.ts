/** Validation messages written for staff. Never construct this from an unexpected exception. */
export class StaffFormError extends Error {}

export function staffFormMessage(error: unknown, fallback: string) {
  return error instanceof StaffFormError ? error.message : fallback;
}

export async function readStaffFormResponse<T>(response: Response, fallback: string): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (response.ok && data && typeof data === "object") return data as T;
  if (
    response.status >= 400 &&
    response.status < 500 &&
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
  )
    throw new StaffFormError(data.error);
  throw new StaffFormError(fallback);
}

export function staffFieldIssue(
  label: string,
  issue: Partial<ValidityState>,
  min: string,
  max: string,
  step: string,
) {
  const field = `「${label}」`;
  if (issue.valueMissing) return `请填写或选择${field}。`;
  if (issue.rangeUnderflow) return `${field}至少为 ${min}，请改大后再保存。`;
  if (issue.rangeOverflow) return `${field}最多为 ${max}，请改小后再保存。`;
  if (issue.stepMismatch)
    return `请把${field}填成${step === "0.01" ? "最多两位小数的金额" : "整数"}。`;
  return `请检查${field}后再保存。`;
}
