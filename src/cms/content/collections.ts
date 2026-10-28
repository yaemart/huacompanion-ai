import { catalogLanguages } from "../../lib/catalog-options";
import type { CollectionConfig } from "payload";
import { canEditContent } from "../../lib/content-model";
import { contentSections, sectionFor } from "../../lib/content-sections";
const closed = () => false;
const access = {
  create: closed,
  update: closed,
  delete: closed,
  read: ({ req }: any) => canEditContent(req.user),
  readVersions: ({ req }: any) => canEditContent(req.user),
};
const group = "内容中心";
export const ContentDrafts: CollectionConfig = {
  slug: "content-drafts",
  labels: { singular: "内容工作稿", plural: "内容工作稿" },
  admin: {
    group,
    useAsTitle: "title",
    description: "通过「内容工作台」编辑、预览和审核发布。本列表只读。",
    defaultColumns: ["title", "sectionLabel", "locale", "kind", "reviewState"],
  },
  access,
  versions: { maxPerDoc: 30 },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const body = data.body || originalDoc?.body || {};
        data.sectionLabel = contentSections.find(
          (s) => s.id === sectionFor(body),
        )!.zh;
        return data;
      },
    ],
  },
  fields: [
    {
      name: "providerRef",
      label: "内部服务商关联",
      type: "number",
      access: { read: ({ req }) => req.user?.role === "admin" },
    },
    { name: "title", label: "标题", type: "text", required: true },
    {
      name: "sectionLabel",
      label: "主板块",
      type: "text",
      admin: { readOnly: true },
    },
    { name: "contentKey", type: "text", required: true },
    {
      name: "locale",
      label: "语言",
      type: "select",
      options: catalogLanguages.map(({ code, zh }) => ({ label: zh, value: code })),
      required: true,
    },
    { name: "kind", label: "类型", type: "text", required: true },
    { name: "slug", label: "网址", type: "text", required: true },
    {
      name: "identity",
      type: "text",
      required: true,
      unique: true,
      admin: { hidden: true },
    },
    {
      name: "routeKey",
      type: "text",
      required: true,
      unique: true,
      admin: { hidden: true },
    },
    { name: "body", label: "内容", type: "json", required: true },
    { name: "revision", label: "修订号", type: "number", required: true },
    {
      name: "reviewState",
      label: "审核状态",
      type: "select",
      options: [
        { label: "草稿", value: "draft" },
        { label: "待审核", value: "review" },
        { label: "退回", value: "returned" },
        { label: "已审核", value: "approved" },
      ],
      required: true,
    },
    { name: "reviewNote", label: "审核意见", type: "textarea" },
    { name: "everPublished", type: "checkbox", defaultValue: false },
    { name: "sourceRevision", type: "number" },
    { name: "sourceDraft", type: "number" },
  ],
};
export const ContentPublished: CollectionConfig = {
  slug: "content-published",
  labels: { singular: "正式内容", plural: "正式内容" },
  admin: { group, useAsTitle: "routeKey" },
  access: { ...access, read: ({ req }) => req.user?.role === "admin" },
  fields: [
    { name: "providerRef", type: "number" },
    { name: "suspended", type: "checkbox", defaultValue: false },
    { name: "draftId", type: "number", unique: true, required: true },
    { name: "routeKey", type: "text", unique: true, required: true },
    { name: "active", type: "checkbox", defaultValue: true },
    { name: "revision", type: "number", required: true },
    { name: "body", type: "json", required: true },
    { name: "publishedBy", type: "number", required: true },
    { name: "publishedAt", type: "date", required: true },
  ],
};
export const ContentEvents: CollectionConfig = {
  slug: "content-events",
  labels: { singular: "发布记录", plural: "发布记录" },
  admin: { group },
  access: { ...access, read: ({ req }) => req.user?.role === "admin" },
  fields: [
    { name: "draftId", type: "number", required: true },
    { name: "action", type: "text", required: true },
    { name: "actor", type: "number", required: true },
    { name: "revision", type: "number" },
    { name: "snapshot", type: "json" },
  ],
};
export const ContentMedia: CollectionConfig = {
  slug: "content-media",
  labels: { singular: "图片素材", plural: "图片素材" },
  admin: { group, useAsTitle: "alt" },
  access,
  fields: [
    { name: "filename", type: "text", unique: true, required: true },
    { name: "alt", label: "图片说明", type: "text", required: true },
    { name: "rights", label: "使用权来源", type: "text", required: true },
    { name: "size", type: "number", required: true },
  ],
};
export const AgentTasks: CollectionConfig = {
  slug: "content-agent-tasks",
  labels: { singular: "AI内容任务", plural: "AI内容任务" },
  admin: {
    group,
    useAsTitle: "title",
    description: "模型未配置时不会发起调用。使用内容工作台管理任务。",
  },
  access,
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "text", required: true },
    { name: "status", type: "text", required: true },
    { name: "input", type: "json", required: true },
    { name: "result", type: "json" },
    { name: "error", type: "textarea" },
    { name: "attempts", type: "number", defaultValue: 0 },
    { name: "lease", type: "text" },
    { name: "leaseUntil", type: "date" },
    { name: "usage", type: "json" },
    { name: "adoptedDraft", type: "number" },
    { name: "createdBy", type: "number", required: true },
  ],
};
export const contentCollections = [
  ContentDrafts,
  ContentPublished,
  ContentEvents,
  ContentMedia,
  AgentTasks,
];
