import {
  catalogLock,
  suspendProviderProjects,
} from "../server/catalog/eligibility";
import { Forbidden } from "payload";
import type {
  CollectionConfig,
  Field,
  CollectionAfterChangeHook,
  Access,
} from "payload";
import { isAdmin, isOperator, inquiryScope } from "./access";
const admin: Access = ({ req }) => isAdmin(req.user);
const operators: Access = ({ req }) => isOperator(req.user);
const assigned: Access = ({ req }) => inquiryScope(req.user);
const fieldAdmin = {
  create: ({ req }: any) => isAdmin(req.user),
  update: ({ req }: any) => isAdmin(req.user),
};
const protectedField = { create: () => false, update: () => false };
const categoryOptions = [
  { label: "医疗机构对接", value: "medical" },
  { label: "展会与商务访问", value: "business" },
  { label: "接送机与交通", value: "transport" },
  { label: "酒店与长期住宿", value: "stays" },
  { label: "旅游机构对接", value: "travel" },
  { label: "翻译与陪同", value: "interpretation" },
  { label: "来华准备与生活协助", value: "arrival" },
];
const audit: CollectionAfterChangeHook = async ({
  req,
  doc,
  previousDoc,
  operation,
  collection,
}) => {
  if (req.context.skipAudit) return doc;
  const changed = Object.keys(doc).filter(
    (k) =>
      !["updatedAt", "createdAt", "_status"].includes(k) &&
      JSON.stringify(doc[k]) !== JSON.stringify(previousDoc?.[k]),
  );
  await req.payload.create({
    collection: "audit-events",
    req,
    overrideAccess: true,
    data: {
      entity: collection.slug,
      recordId: String(doc.id),
      action: operation,
      actor: req.user?.id,
      fields: changed.join(", "),
    },
  });
  return doc;
};
const intakeFields: Field[] = [
  {
    name: "reference",
    label: "咨询／申请编号",
    type: "text",
    required: true,
    unique: true,
    admin: { readOnly: true },
    access: protectedField,
  },
  { name: "name", label: "联系人", type: "text", required: true },
  { name: "email", label: "电子邮箱", type: "email", required: true },
  {
    name: "categories",
    label: "服务类别",
    type: "select",
    hasMany: true,
    options: categoryOptions,
    required: true,
  },
  { name: "city", label: "城市／服务区域", type: "text", required: true },
  {
    name: "details",
    label: "需求详情（初始提交）",
    type: "json",
    admin: { readOnly: true },
    access: protectedField,
  },
  {
    name: "source",
    label: "来源",
    type: "select",
    options: [
      { label: "网站", value: "website" },
      { label: "App", value: "app" },
      { label: "后台录入", value: "manual" },
    ],
    defaultValue: "website",
    admin: { readOnly: true },
    access: protectedField,
  },
  {
    name: "locale",
    label: "提交语言",
    type: "select",
    options: ["en", "zh"],
    defaultValue: "en",
    admin: { readOnly: true },
    access: protectedField,
  },
  {
    name: "consentAt",
    label: "隐私告知确认时间",
    type: "date",
    admin: { readOnly: true },
    access: protectedField,
  },
  {
    name: "privacyVersion",
    label: "隐私告知版本",
    type: "text",
    admin: { readOnly: true },
    access: protectedField,
  },
  {
    name: "requestKey",
    type: "text",
    required: true,
    unique: true,
    admin: { hidden: true },
    access: { read: () => false, ...protectedField },
  },
  {
    name: "contentHash",
    type: "text",
    required: true,
    admin: { hidden: true },
    access: { read: () => false, ...protectedField },
  },
];
export const Staff: CollectionConfig = {
  slug: "staff",
  endpoints: [
    {
      path: "/first-register",
      method: "post",
      handler: async () =>
        Response.json(
          { error: "Public employee registration is disabled." },
          { status: 403 },
        ),
    },
  ],
  labels: { singular: "员工账号", plural: "员工账号" },
  admin: {
    useAsTitle: "name",
    group: "系统管理",
    defaultColumns: ["name", "email", "role"],
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600000,
    tokenExpiration: 7200,
    cookies: { sameSite: "Strict", secure: process.env.APP_ENV !== "local" },
  },
  access: {
    admin: ({ req }) =>
      !!req.user && ["admin", "operations", "editor"].includes(req.user.role),
    create: admin,
    read: ({ req }) =>
      isAdmin(req.user)
        ? true
        : req.user
          ? { id: { equals: req.user.id } }
          : false,
    update: admin,
    delete: admin,
  },
  fields: [
    { name: "name", label: "姓名", type: "text", required: true },
    {
      name: "role",
      label: "角色",
      type: "select",
      required: true,
      defaultValue: "editor",
      saveToJWT: true,
      options: [
        { label: "管理员", value: "admin" },
        { label: "客户运营", value: "operations" },
        { label: "内容编辑", value: "editor" },
      ],
      access: fieldAdmin,
    },
  ],
  hooks: {
    beforeChange: [
      ({ req, operation, data }) => {
        if (
          operation === "create" &&
          !isAdmin(req.user) &&
          req.context.allowLocalStaffSetup !== true
        )
          throw new Forbidden();
        return data;
      },
    ],
    afterChange: [audit],
  },
};
export const Inquiries: CollectionConfig = {
  slug: "inquiries",
  labels: { singular: "客户咨询", plural: "客户咨询" },
  admin: {
    useAsTitle: "reference",
    group: "业务运营",
    defaultColumns: [
      "reference",
      "name",
      "city",
      "status",
      "owner",
      "nextFollowUp",
      "createdAt",
    ],
    listSearchableFields: ["reference", "name", "email", "city"],
  },
  access: {
    create: () => false,
    read: assigned,
    update: assigned,
    delete: admin,
    readVersions: admin,
  },
  versions: { maxPerDoc: 30 },
  fields: [
    ...intakeFields,
    {
      name: "catalogSource",
      label: "咨询来源（服务商／服务项目）",
      type: "json",
      admin: { readOnly: true },
      access: { update: () => false },
    },
    {
      name: "status",
      label: "处理状态",
      type: "select",
      required: true,
      defaultValue: "new",
      options: [
        { label: "新咨询", value: "new" },
        { label: "待补充", value: "needs-info" },
        { label: "处理中", value: "processing" },
        { label: "已报价", value: "quoted" },
        { label: "已成交", value: "won" },
        { label: "已关闭", value: "closed" },
      ],
    },
    {
      name: "owner",
      label: "负责人",
      type: "relationship",
      relationTo: "staff",
      access: fieldAdmin,
    },
    {
      name: "nextFollowUp",
      label: "下次跟进时间",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "notes",
      label: "内部跟进记录",
      type: "textarea",
      maxLength: 10000,
    },
  ],
  hooks: { afterChange: [audit] },
};
export const Providers: CollectionConfig = {
  slug: "providers",
  labels: { singular: "服务商申请", plural: "服务商入驻与合作" },
  admin: {
    useAsTitle: "organisation",
    group: "业务运营",
    defaultColumns: [
      "organisation",
      "reference",
      "city",
      "status",
      "publicApproved",
    ],
  },
  access: {
    create: () => false,
    read: operators,
    update: operators,
    delete: admin,
    readVersions: operators,
  },
  versions: { maxPerDoc: 30 },
  fields: [
    ...intakeFields,
    { name: "organisation", label: "机构名称", type: "text", required: true },
    { name: "phone", label: "电话", type: "text", required: true },
    { name: "languages", label: "支持语言", type: "text", required: true },
    {
      name: "capabilities",
      label: "服务能力",
      type: "textarea",
      required: true,
    },
    { name: "website", label: "官网／公开介绍链接", type: "text" },
    { name: "hours", label: "营业时段", type: "text" },
    { name: "qualification", label: "资质类型及编号", type: "text" },
    {
      name: "status",
      label: "合作状态",
      type: "select",
      defaultValue: "applied",
      required: true,
      access: fieldAdmin,
      options: [
        { label: "已申请", value: "applied" },
        { label: "已核实", value: "verified" },
        { label: "已签约", value: "contracted" },
        { label: "暂停合作", value: "paused" },
      ],
    },
    {
      name: "publicApproved",
      label: "允许公开展示（需另获机构许可）",
      type: "checkbox",
      defaultValue: false,
      access: fieldAdmin,
    },
    { name: "notes", label: "内部审核备注", type: "textarea" },
  ],
  hooks: {
    beforeChange: [
      async ({ req, data }) => {
        await catalogLock(req);
        return data;
      },
    ],
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (
          (data?.publicApproved ?? originalDoc?.publicApproved) &&
          !["verified", "contracted"].includes(
            data?.status || originalDoc?.status,
          )
        )
          throw new Error("只有已核实或已签约机构可以批准展示。");
        return data;
      },
    ],
    afterChange: [audit, suspendProviderProjects],
  },
};
export const Notifications: CollectionConfig = {
  slug: "notifications",
  labels: { singular: "通知任务", plural: "通知任务" },
  admin: {
    useAsTitle: "reference",
    group: "系统管理",
    description: "本地阶段未配置邮件服务。任务已保存，不代表邮件已发送。",
    defaultColumns: ["reference", "kind", "status", "createdAt"],
  },
  access: {
    create: () => false,
    read: admin,
    update: () => false,
    delete: admin,
  },
  fields: [
    { name: "reference", label: "关联编号", type: "text", required: true },
    {
      name: "kind",
      label: "任务类型",
      type: "select",
      options: [
        { label: "新客户咨询", value: "request" },
        { label: "新合作申请", value: "apply" },
      ],
      required: true,
    },
    {
      name: "status",
      label: "发送状态",
      type: "select",
      defaultValue: "awaiting-configuration",
      options: [
        { label: "待配置邮件服务", value: "awaiting-configuration" },
        { label: "待发送", value: "pending" },
        { label: "发送失败", value: "failed" },
        { label: "服务商已接收", value: "accepted" },
        { label: "已送达", value: "delivered" },
      ],
    },
    { name: "attempts", label: "尝试次数", type: "number", defaultValue: 0 },
    { name: "lastError", label: "最近失败原因", type: "textarea" },
  ],
};
export const AuditEvents: CollectionConfig = {
  slug: "audit-events",
  labels: { singular: "操作记录", plural: "操作记录" },
  admin: {
    group: "系统管理",
    defaultColumns: ["entity", "recordId", "action", "actor", "createdAt"],
  },
  access: {
    create: () => false,
    read: admin,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "entity", label: "数据类型", type: "text", required: true },
    { name: "recordId", label: "记录ID", type: "text", required: true },
    { name: "action", label: "操作", type: "text", required: true },
    {
      name: "actor",
      label: "操作员工",
      type: "relationship",
      relationTo: "staff",
    },
    { name: "fields", label: "变更字段", type: "text" },
  ],
};
const IntakeLimits: CollectionConfig = {
  slug: "intake-limits",
  admin: { hidden: true },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "bucket", type: "number", required: true, unique: true },
    { name: "count", type: "number", required: true, defaultValue: 0 },
  ],
};
export const collections = [
  Staff,
  Inquiries,
  Providers,
  Notifications,
  AuditEvents,
  IntakeLimits,
];
