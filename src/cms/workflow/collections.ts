import type { CollectionConfig, GlobalConfig, Field, TextField } from "payload";
import { isAdmin } from "../access";
import { defaultInquiryReplies } from "../../lib/intake-receipt";
import { workflowEventTypes } from "../../lib/workflow";
const access: NonNullable<CollectionConfig["access"]> = {
  read: ({ req }) => isAdmin(req.user),
  create: () => false,
  update: () => false,
  delete: () => false,
};
const text = (
  name: string,
  extra: Pick<TextField, "required" | "unique" | "index"> = {},
): Field => ({
  name,
  type: "text",
  ...extra,
});
const rel = (name: string, relationTo: string): Field =>
  ({ name, type: "relationship", relationTo }) as Field;
const base = { access, admin: { group: "通知与待办" } };
export const workflowCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "workflow-events",
    fields: [
      text("key", { required: true, unique: true }),
      { name: "type", type: "select", options: [...workflowEventTypes], required: true },
      rel("inquiry", "inquiries"),
      rel("contentDraft", "content-drafts"),
      rel("recipient", "staff"),
      text("title", { required: true }),
      { name: "dueAt", type: "date" },
    ],
  },
  {
    ...base,
    slug: "workflow-notifications",
    fields: [
      text("key", { required: true, unique: true }),
      rel("event", "workflow-events"),
      rel("inquiry", "inquiries"),
      rel("contentDraft", "content-drafts"),
      rel("recipient", "staff"),
      text("title", { required: true }),
      { name: "readAt", type: "date" },
    ],
  },
  {
    ...base,
    slug: "workflow-tasks",
    fields: [
      rel("policyGroup", "policy-groups"),
      text("key", { required: true, unique: true }),
      rel("inquiry", "inquiries"),
      rel("contentDraft", "content-drafts"),
      rel("assignee", "staff"),
      text("title", { required: true }),
      {
        name: "status",
        type: "select",
        options: ["open", "done"],
        defaultValue: "open",
        required: true,
      },
      { name: "dueAt", type: "date" },
      { name: "history", type: "json" },
    ],
  },
  {
    ...base,
    slug: "workflow-customer-notifications",
    access: { ...access, read: () => false },
    fields: [
      text("key", { required: true, unique: true }),
      rel("customer", "customer-accounts"),
      rel("inquiry", "inquiries"),
      text("type", { required: true }),
      text("title", { required: true }),
      { name: "readAt", type: "date" },
    ],
  },
  {
    ...base,
    slug: "workflow-mail-jobs",
    fields: [
      text("key", { required: true, unique: true }),
      rel("notification", "workflow-notifications"),
      rel("customerNotification", "workflow-customer-notifications"),
      {
        name: "status",
        type: "select",
        options: ["queued", "running", "sent", "disabled", "retry", "uncertain", "failed"],
        required: true,
        defaultValue: "queued",
      },
      text("lease"),
      { name: "leaseUntil", type: "date" },
      { name: "nextAt", type: "date" },
      { name: "attempts", type: "number", defaultValue: 0 },
      text("providerId"),
    ],
  },
];
export const workflowSettings: GlobalConfig = {
  slug: "workflow-settings",
  label: "通知设置",
  access: { read: ({ req }) => isAdmin(req.user), update: ({ req }) => isAdmin(req.user) },
  fields: [
    {
      name: "enabledEvents",
      type: "select",
      hasMany: true,
      options: [...workflowEventTypes],
      defaultValue: [...workflowEventTypes],
    },
    {
      name: "inquiryReplyZh",
      label: "咨询回执：回复时间承诺（中文）",
      type: "textarea",
      maxLength: 500,
      defaultValue: defaultInquiryReplies.zh,
      admin: {
        description: "咨询保存成功后显示。留空使用默认文字；这是人工回复承诺，不会自动发邮件。",
      },
    },
    {
      name: "inquiryReplyEn",
      label: "咨询回执：回复时间承诺（英文）",
      type: "textarea",
      maxLength: 500,
      defaultValue: defaultInquiryReplies.en,
      admin: { description: "咨询保存成功后显示。留空使用默认文字；修改后重新打开表单查看。" },
    },
    { name: "emailEnabled", type: "checkbox", defaultValue: false },
    { name: "escalationEnabled", type: "checkbox", defaultValue: false },
    { name: "escalationHours", type: "number", defaultValue: 24, min: 1, max: 720 },
  ],
};
