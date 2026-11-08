import type { ImmigrationPolicy } from "../../payload-types.ts";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("入境政策格式无效");
  const data = value as Record<string, unknown>;
  if (typeof data.countryCode !== "string" || !/^[A-Z]{2}$/.test(data.countryCode))
    throw Error("国家代码需为两位大写 ISO 格式，由审核员核实");
  if (!text(data.countryNameEn, 100) || !text(data.countryNameZh, 100))
    throw Error("请填写中英文国家名称");
  if (!policyTypes.some((type) => type === data.policyType)) throw Error("政策类型无效");
  const hours = data.policyType === "transit-240h" && data.maxStayHours != null;
  const duration = hours ? data.maxStayHours : data.maxStayDays;
  if (typeof duration !== "number" || !Number.isSafeInteger(duration) || duration < 1)
    throw Error(hours ? "最长停留小时必须为正整数" : "最长停留天数必须为正整数");
  if (data.policyType !== "transit-240h" && data.maxStayHours != null)
    throw Error("非过境政策请填写天数，不使用小时");
  if (!isPolicyCalendarDate(data.validFrom) || !isPolicyCalendarDate(data.lastVerifiedOn))
    throw Error("生效日及最后核实日期需为有效日历日");
  if (
    data.validUntil != null &&
    (!isPolicyCalendarDate(data.validUntil) || data.validUntil < data.validFrom)
  )
    throw Error("截止日需为空或不早于生效日");
  if (data.lastVerifiedOn > today) throw Error("最后核实日期不能晚于今天");
  if (
    !Array.isArray(data.portsAndRegions) ||
    data.portsAndRegions.length > 100 ||
    data.portsAndRegions.some((region: unknown) => !text(region, 2000)) ||
    (data.policyType === "transit-240h" && !data.portsAndRegions.length)
  )
    throw Error("过境政策需填写适用口岸或区域");
  if (!text(data.publicNotes, 4000, false)) throw Error("政策备注格式无效");
  try {
    if (!text(data.officialSourceUrl, 2000)) throw Error();
    const url = new URL(data.officialSourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw Error();
  } catch {
    throw Error("请填写不含账户信息的官方 HTTPS 来源链接");
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
    throw Error("请选择核实人");
  if (data.internalNotes != null && !text(data.internalNotes, 4000, false))
    throw Error("政策备注格式无效");
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
