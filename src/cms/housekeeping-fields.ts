import type { Field } from "payload";
import { isManager } from "./access";
export const housekeepingApplication: Field = {
  name: "housekeepingApplication",
  label: "家政入驻原始资料",
  type: "json",
  admin: {
    readOnly: true,
    condition: (d) => d.categories?.includes("housekeeping"),
    components: { Field: "/cms/IntakeDetailsField#IntakeDetailsField" },
  },
  access: { create: () => false, update: () => false },
};
export const housekeepingVerification: Field = {
  name: "housekeepingVerification",
  label: "家政内部核实与合作资料",
  type: "group",
  admin: { condition: (d) => d.categories?.includes("housekeeping") },
  access: { create: ({ req }) => isManager(req.user), update: ({ req }) => isManager(req.user) },
  fields: [
    { name: "entityEvidence", label: "主体核实依据及材料存放位置（受控位置）", type: "textarea" },
    { name: "staffEvidence", label: "人员来源、身份核实及替换机制", type: "textarea" },
    { name: "languageEvidence", label: "客服／上门人员语言核实记录", type: "textarea" },
    { name: "insuranceEvidence", label: "保险凭证与适用范围（未知须注明）", type: "textarea" },
    { name: "aftercareEvidence", label: "取消、返工、损坏及投诉责任确认", type: "textarea" },
    { name: "commercialTerms", label: "内部合作报价及佣金", type: "textarea" },
    { name: "reviewedAt", label: "核实日期", type: "date" },
    { name: "reviewed", label: "上述必要资料已核实", type: "checkbox", defaultValue: false },
  ],
};
export const homeFulfilment: Field = {
  name: "homeFulfilment",
  label: "家政安排（内部）",
  type: "group",
  admin: { condition: (d) => d.categories?.includes("housekeeping") },
  fields: [
    { name: "provider", label: "实际履约服务商", type: "relationship", relationTo: "providers" },
    { name: "scope", label: "已确认服务范围", type: "textarea" },
    { name: "quote", label: "已确认报价、收费方与取消规则", type: "textarea" },
    { name: "confirmation", label: "客户确认记录（时间、渠道、范围）", type: "textarea" },
    { name: "fullAddress", label: "确认安排后收集的详细地址（不记录门禁密码）", type: "textarea" },
    {
      name: "scheduledAt",
      label: "确认服务时间",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    { name: "personnel", label: "上门人员及身份核对安排（不录证件号）", type: "textarea" },
    { name: "handover", label: "到访和交接说明（不录密码）", type: "textarea" },
    { name: "aftercare", label: "回访、返工、退款与损坏处理记录", type: "textarea" },
  ],
};
export const homeSharingLog: Field = {
  name: "homeSharingLog",
  label: "家政必要信息转交记录（仅追加）",
  type: "array",
  admin: {
    condition: (d) => d.categories?.includes("housekeeping"),
    description: "仅记录已获授权的必要信息转交；系统不会自动发送。",
  },
  fields: [
    { name: "recipient", label: "接收方名称与角色", type: "text", required: true },
    {
      name: "scope",
      label: "实际转交信息范围（不重复粘贴敏感内容）",
      type: "textarea",
      required: true,
    },
    {
      name: "consentEvidence",
      label: "客户明确授权依据／受控记录位置",
      type: "textarea",
      required: true,
    },
    { name: "consentAt", label: "获得授权时间", type: "date", required: true },
    { name: "sharedAt", label: "实际转交时间", type: "date", required: true },
  ],
};
export async function guardHomeWorkflow({ req, data, originalDoc }: any) {
  const merged = { ...originalDoc, ...data };
  const isHome =
    merged.categories?.includes("housekeeping") ||
    originalDoc?.categories?.includes("housekeeping");
  if (req.collection?.config?.slug === "providers" || "organisation" in merged) {
    const v = { ...originalDoc?.housekeepingVerification, ...data.housekeepingVerification };
    if (isHome && merged.publicApproved) {
      if (
        !v.reviewed ||
        !v.reviewedAt ||
        [
          "entityEvidence",
          "staffEvidence",
          "languageEvidence",
          "insuranceEvidence",
          "aftercareEvidence",
        ].some((k) => !v[k]?.trim())
      )
        throw Error("家政公开展示前需完成主体、人员、语言、保险及售后核实记录");
    }
  } else {
    const f = { ...originalDoc?.homeFulfilment, ...data.homeFulfilment };
    if ((f.fullAddress || f.scheduledAt) && !f.confirmation?.trim())
      throw Error("收集详细地址或确认时间前请记录客户确认依据");
    if (data.homeFulfilment?.provider) {
      const id = typeof f.provider === "object" ? f.provider.id : f.provider;
      const provider = await req.payload.findByID({
        collection: "providers",
        id,
        overrideAccess: false,
        user: req.user,
        req,
        depth: 0,
      });
      if (
        !provider.categories?.includes("housekeeping") ||
        !["verified", "contracted"].includes(provider.status)
      )
        throw Error("请选择权限范围内已核实的家政服务商");
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "homeSharingLog") &&
    (data.homeSharingLog != null || originalDoc?.homeSharingLog?.length)
  ) {
    if (!Array.isArray(data.homeSharingLog)) throw Error("转交历史必须保留为数组，不可清空");
    const before = originalDoc?.homeSharingLog || [],
      after = data.homeSharingLog;
    if (
      after.length < before.length ||
      before.some((r: any, i: number) =>
        ["recipient", "scope", "consentEvidence", "consentAt", "sharedAt"].some(
          (k) => r[k] !== after[i]?.[k],
        ),
      )
    )
      throw Error("信息转交历史不可覆盖或删除");
    for (const r of after.slice(before.length))
      if (
        ["recipient", "scope", "consentEvidence"].some(
          (k) => typeof r[k] !== "string" || !r[k].trim(),
        ) ||
        !Number.isFinite(Date.parse(r.consentAt)) ||
        !Number.isFinite(Date.parse(r.sharedAt)) ||
        Date.parse(r.consentAt) > Date.parse(r.sharedAt) ||
        Date.parse(r.sharedAt) > Date.now()
      )
        throw Error("转交前必须有明确授权、接收方、范围和有效时间");
  }
  return data;
}
