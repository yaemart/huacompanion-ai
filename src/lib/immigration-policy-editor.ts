import type { ImmigrationPolicy } from "../../payload-types.ts";
import { policyFields } from "./immigration-policy-draft.ts";
import { relationID } from "../cms/access.ts";
export type PolicyForm = Omit<
  Partial<Pick<ImmigrationPolicy, (typeof policyFields)[number]>>,
  "portsAndRegions" | "verifiedBy"
> & { portsAndRegions: string[]; verifiedBy: number | null };
export const policyLabels = {
  countryCode: "国家 ISO 两位代码",
  countryNameEn: "国家英文名称",
  countryNameZh: "国家中文名称",
  policyType: "政策类型",
  maxStayDays: "最长停留（天）",
  maxStayHours: "最长停留（小时）",
  validFrom: "生效日",
  validUntil: "截止日（可空）",
  portsAndRegions: "适用口岸或区域条件（每行一条）",
  officialSourceUrl: "官方来源链接",
  lastVerifiedOn: "最后核实日期",
  verifiedBy: "核实人",
  publicNotes: "公开政策说明",
  internalNotes: "内部核实备注（不公开）",
} as const;
export function policyForm(record?: ImmigrationPolicy): PolicyForm {
  return {
    ...Object.fromEntries(policyFields.map((key) => [key, record?.[key] ?? null])),
    portsAndRegions: (record?.portsAndRegions || []).map((row) => row.label),
    verifiedBy: Number(relationID(record?.verifiedBy)) || null,
  } as PolicyForm;
}
export function policyFormInput(value: PolicyForm) {
  return {
    ...value,
    portsAndRegions: value.portsAndRegions.map((line) => line.trim()).filter(Boolean),
  };
}
