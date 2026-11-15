import type { ImmigrationPolicy } from "../../payload-types.ts";
import { StaffFormError } from "./staff-form-feedback.ts";

export const policyTypes = [
  "unilateral",
  "bilateral",
  "transit-240h",
  "other",
] as const satisfies readonly NonNullable<ImmigrationPolicy["policyType"]>[];

type PublicationFields = Pick<
  ImmigrationPolicy,
  | "countryCode"
  | "countryNameEn"
  | "countryNameZh"
  | "policyType"
  | "validFrom"
  | "officialSourceUrl"
  | "lastVerifiedOn"
  | "publicNotes"
>;

/** Publication contract; partial drafts are handled by the future CMS collection. */
export type PolicyPublicationData = {
  [Key in keyof PublicationFields]-?: NonNullable<PublicationFields[Key]>;
} & {
  maxStayDays?: ImmigrationPolicy["maxStayDays"];
  maxStayHours?: ImmigrationPolicy["maxStayHours"];
  validUntil?: ImmigrationPolicy["validUntil"];
  portsAndRegions: NonNullable<ImmigrationPolicy["portsAndRegions"]>[number]["label"][];
  verifiedBy: Extract<ImmigrationPolicy["verifiedBy"], number>;
  internalNotes?: ImmigrationPolicy["internalNotes"];
};

export type PublicPolicyData = Omit<PolicyPublicationData, "verifiedBy" | "internalNotes">;

export function isPolicyCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function text(value: unknown, max: number, required = true): value is string {
  return typeof value === "string" && (!required || value.trim().length > 0) && value.length <= max;
}

/** `today` is supplied explicitly in China calendar dates; no clock or network side effects. */
export function validatePublicPolicy(
  value: unknown,
  today: string,
): asserts value is PublicPolicyData {
  if (!isPolicyCalendarDate(today)) throw Error("核实日期基准无效");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StaffFormError("请打开政策草稿，填写并保存「政策资料」后再送审。");
  const data = value as Record<string, unknown>;
  if (typeof data.countryCode !== "string" || !/^[A-Z]{2}$/.test(data.countryCode))
    throw new StaffFormError("请在「适用国家」重新选择国家，由审核员核实。");
  if (!text(data.countryNameEn, 100) || !text(data.countryNameZh, 100))
    throw new StaffFormError("国家名称缺失或过长，请在「适用国家」重新选择。");
  if (!policyTypes.some((type) => type === data.policyType))
    throw new StaffFormError("请在「政策类型」选择这条政策适用的类型。");
  const hours = data.policyType === "transit-240h" && data.maxStayHours != null;
  const duration = hours ? data.maxStayHours : data.maxStayDays;
  if (typeof duration !== "number" || !Number.isSafeInteger(duration) || duration < 1) {
    const unit = data.policyType === "transit-240h" ? "小时" : "天";
    throw new StaffFormError(`请把「最长停留（${unit}）」填成大于 0 的整数。`);
  }
  if (data.policyType !== "transit-240h" && data.maxStayHours != null)
    throw new StaffFormError("此政策按天计算，请在「最长停留（天）」填写天数。");
  if (!isPolicyCalendarDate(data.validFrom))
    throw new StaffFormError("请在「生效日」选择政策正式开始的日期。");
  if (!isPolicyCalendarDate(data.lastVerifiedOn))
    throw new StaffFormError("请在「最后核实日期」选择实际核对官方来源的日期。");
  if (
    data.validUntil != null &&
    (!isPolicyCalendarDate(data.validUntil) || data.validUntil < data.validFrom)
  )
    throw new StaffFormError("「截止日」须选生效日当天或之后。如官方未公布截止日，可以留空。");
  if (data.lastVerifiedOn > today)
    throw new StaffFormError("「最后核实日期」不能晚于今天（北京时间），请改填实际核实的日期。");
  if (
    data.policyType === "transit-240h" &&
    Array.isArray(data.portsAndRegions) &&
    !data.portsAndRegions.length
  )
    throw new StaffFormError("请在「适用口岸或区域条件」填写过境政策要求，每行一条。");
  if (
    !Array.isArray(data.portsAndRegions) ||
    data.portsAndRegions.length > 100 ||
    data.portsAndRegions.some((region: unknown) => !text(region, 2000))
  )
    throw new StaffFormError("请检查「适用口岸或区域条件」。最多填 100 条，每条最多 2,000 字。");
  if (!text(data.publicNotes, 4000, false))
    throw new StaffFormError("「公开说明」最多 4,000 字，请缩短后保存。");
  if (typeof data.officialSourceUrl === "string" && data.officialSourceUrl.length > 2000)
    throw new StaffFormError("「官方来源链接」最多 2,000 字，请换用更短的官方网页地址。");
  try {
    if (!text(data.officialSourceUrl, 2000)) throw Error();
    const url = new URL(data.officialSourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw Error();
  } catch {
    throw new StaffFormError(
      "请在「官方来源链接」粘贴以 https:// 开头的完整官网网址，去掉其中的账号和密码。",
    );
  }
}

export function validatePolicyPublication(
  value: unknown,
  today: string,
): asserts value is PolicyPublicationData {
  validatePublicPolicy(value, today);
  const data = value as unknown as Record<string, unknown>;
  if (
    typeof data.verifiedBy !== "number" ||
    !Number.isSafeInteger(data.verifiedBy) ||
    data.verifiedBy < 1
  )
    throw new StaffFormError("请在「核实人」选择实际核对政策的员工。");
  if (data.internalNotes != null && !text(data.internalNotes, 4000, false))
    throw new StaffFormError("「内部核实备注」最多 4,000 字，请缩短后保存。");
}

/** Explicit field allowlist; this does not publish a draft or authorize a caller. */
export function publicPolicy(data: PublicPolicyData): PublicPolicyData {
  return {
    countryCode: data.countryCode,
    countryNameEn: data.countryNameEn,
    countryNameZh: data.countryNameZh,
    policyType: data.policyType,
    maxStayDays: data.maxStayDays,
    ...(data.maxStayHours != null ? { maxStayHours: data.maxStayHours } : {}),
    validFrom: data.validFrom,
    validUntil: data.validUntil ?? null,
    portsAndRegions: [...data.portsAndRegions],
    officialSourceUrl: data.officialSourceUrl,
    lastVerifiedOn: data.lastVerifiedOn,
    publicNotes: data.publicNotes,
  };
}
