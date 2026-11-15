import type { ImmigrationPolicy } from "../../payload-types.ts";
import { StaffFormError } from "./staff-form-feedback.ts";
export const policyFields = [
  "countryCode",
  "countryNameEn",
  "countryNameZh",
  "policyType",
  "maxStayDays",
  "maxStayHours",
  "validFrom",
  "validUntil",
  "portsAndRegions",
  "officialSourceUrl",
  "lastVerifiedOn",
  "verifiedBy",
  "publicNotes",
  "internalNotes",
] as const;
type PolicyEdits = Partial<Pick<ImmigrationPolicy, (typeof policyFields)[number]>>;
/** Input uses string conditions and numeric staff IDs; generated CMS rows stay internal. */
export function policyDraft(value: unknown): PolicyEdits {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("政策草稿格式无效");
  const data = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(data)) {
    if (!(policyFields as readonly string[]).includes(key)) throw Error("政策字段不允许修改");
    if (key === "portsAndRegions") {
      if (
        !Array.isArray(field) ||
        field.length > 100 ||
        field.some((v: unknown) => typeof v !== "string" || !v.trim() || v.length > 2000)
      )
        throw new StaffFormError(
          "请在「适用口岸或区域条件」每行填写一条，最多 100 条，每条最多 2,000 字。",
        );
      out[key] = field.map((label: string) => ({ label }));
    } else if (["maxStayDays", "maxStayHours", "verifiedBy"].includes(key)) {
      if (field != null && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 1))
        throw new StaffFormError(
          key === "verifiedBy"
            ? "请在「核实人」重新选择实际核对政策的员工。"
            : "请把「最长停留」填成大于 0 的整数。",
        );
      out[key] = field;
    } else {
      if (field != null && (typeof field !== "string" || field.length > 4000)) {
        if (key === "officialSourceUrl")
          throw new StaffFormError(
            "「官方来源链接」太长或无法读取。请粘贴不超过 4,000 字的官方网页地址。",
          );
        throw Error("政策文字无效");
      }
      out[key] = field;
    }
  }
  // Every key and value was validated above; Payload validates select values on write.
  return out as PolicyEdits;
}
