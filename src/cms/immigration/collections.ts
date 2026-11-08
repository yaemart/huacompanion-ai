import type { CollectionConfig } from "payload";
import { isAdmin } from "../access.ts";
import { policyTypes } from "../../lib/immigration-policy.ts";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags.ts";

const closed = () => false;
const labels = ["单方面免签", "互免", "240 小时过境", "其他"];

export const ImmigrationPolicies: CollectionConfig = {
  slug: "immigration-policies",
  dbName: "imm_policies",
  typescript: { interface: "ImmigrationPolicy" },
  labels: { singular: "入境政策", plural: "入境政策" },
  admin: {
    group: "内容中心",
    useAsTitle: "policyKey",
    hidden: !visaCheckerEnabled(),
    description: "当前为只读结构，录入和审核将在后续步骤接入内容工作流；尚未提供公开查询。",
    defaultColumns: ["policyKey", "countryNameZh", "policyType", "status", "lastVerifiedOn"],
  },
  access: {
    admin: ({ req }) => isAdmin(req.user),
    read: ({ req }) => isAdmin(req.user),
    readVersions: ({ req }) => isAdmin(req.user),
    create: closed,
    update: closed,
    delete: closed,
    unlock: closed,
  },
  versions: { maxPerDoc: 30 },
  disableBulkEdit: true,
  disableBulkDelete: true,
  disableDuplicate: true,
  fields: [
    { name: "policyKey", label: "政策标识", type: "text", required: true, unique: true },
    { name: "countryCode", label: "国家 ISO 两位代码", type: "text", index: true },
    { name: "countryNameEn", label: "国家英文名称", type: "text" },
    { name: "countryNameZh", label: "国家中文名称", type: "text" },
    {
      name: "policyType",
      label: "政策类型",
      type: "select",
      options: policyTypes.map((value, index) => ({ label: labels[index], value })),
    },
    { name: "maxStayDays", label: "最长停留（天）", type: "number", min: 1 },
    { name: "maxStayHours", label: "最长停留（小时）", type: "number", min: 1 },
    {
      name: "validFrom",
      label: "生效日",
      type: "text",
      admin: { placeholder: "YYYY-MM-DD（中国日历日）" },
    },
    {
      name: "validUntil",
      label: "截止日（可空）",
      type: "text",
      admin: { placeholder: "YYYY-MM-DD；空值不代表永久有效" },
    },
    {
      name: "portsAndRegions",
      label: "适用口岸或区域条件",
      type: "array",
      maxRows: 100,
      fields: [{ name: "label", label: "条件说明", type: "textarea", required: true }],
    },
    { name: "officialSourceUrl", label: "官方来源链接", type: "text" },
    {
      name: "lastVerifiedOn",
      label: "最后核实日期",
      type: "text",
      admin: { placeholder: "YYYY-MM-DD（中国日历日）" },
    },
    { name: "verifiedBy", label: "核实人", type: "relationship", relationTo: "staff" },
    { name: "publicNotes", label: "公开政策说明", type: "textarea" },
    { name: "internalNotes", label: "内部核实备注（不公开）", type: "textarea" },
    {
      name: "status",
      label: "工作版本状态",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "草稿", value: "draft" },
        { label: "已发布", value: "published" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "revision",
      label: "政策修订号",
      type: "number",
      required: true,
      min: 1,
      defaultValue: 1,
      admin: { readOnly: true },
    },
  ],
};
