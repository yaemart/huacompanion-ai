import type { ImmigrationPolicy } from "../../payload-types.ts";
export const policyFields = [
  "countryCode",
  "countryNameEn",
  "countryNameZh",
  "policyType",
  "maxStayDays",
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
        throw Error("政策口岸条件无效");
      out[key] = field.map((label: string) => ({ label }));
    } else if (["maxStayDays", "verifiedBy"].includes(key)) {
      if (field != null && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 1))
        throw Error("政策数值无效");
      out[key] = field;
    } else {
      if (field != null && (typeof field !== "string" || field.length > 4000))
        throw Error("政策文字无效");
      out[key] = field;
    }
  }
  // Every key and value was validated above; Payload validates select values on write.
  return out as PolicyEdits;
}
