import { supportWorkflowHook } from "../../server/business/hooks";
import { voiceMessageFields } from "./voice";
import type { CollectionConfig, Field } from "payload";
import { inquiryScope, isAdmin } from "../access";
const privateAccess: NonNullable<CollectionConfig["access"]> = {
  create: () => false,
  update: () => false,
  delete: () => false,
  read: ({ req }) => isAdmin(req.user),
};
const base = { access: privateAccess, admin: { group: "客户服务" } };
const text = (name: string, extra: Partial<Field> = {}): Field =>
  ({ name, type: "text", ...extra }) as Field;
export const supportCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "support-customers",
    labels: { singular: "客服客户", plural: "客服客户" },
    fields: [
      text("name"),
      text("email"),
      { name: "verified", type: "checkbox", defaultValue: false },
      text("locale"),
    ],
  },
  {
    ...base,
    slug: "support-conversations",
    labels: { singular: "客服会话", plural: "客服会话" },
    access: { ...privateAccess, read: ({ req }) => inquiryScope(req.user) },
    admin: {
      group: "客户服务",
      defaultColumns: ["id", "topic", "mode", "status", "owner", "updatedAt"],
    },
    fields: [
      text("visitorHash", { required: true, index: true, access: { read: () => false } }),
      text("startKey", { required: true, unique: true, access: { read: () => false } }),
      text("locale", { required: true }),
      text("topic"),
      { name: "mode", type: "select", options: ["ai", "waiting", "human"], required: true },
      {
        name: "status",
        type: "select",
        options: ["open", "waiting-customer", "resolved"],
        required: true,
        defaultValue: "open",
      },
      { name: "aiRevision", type: "number", required: true, defaultValue: 1 },
      { name: "revision", type: "number", required: true, defaultValue: 1 },
      { name: "aiConsent", type: "checkbox", defaultValue: false },
      { name: "consentAt", type: "date" },
      { name: "team", type: "relationship", relationTo: "teams" },
      { name: "owner", type: "relationship", relationTo: "staff" },
      { name: "customer", type: "relationship", relationTo: "support-customers" },
      { name: "summary", type: "textarea" },
      { name: "proposedRequest", type: "json" },
      { name: "nextFollowUp", type: "date" },
      { name: "inquiryLinks", type: "json" },
    ],
  },
  {
    ...base,
    slug: "support-messages",
    hooks: { afterChange: [supportWorkflowHook] },
    labels: { singular: "客服消息", plural: "客服消息" },
    fields: [
      {
        name: "conversation",
        type: "relationship",
        relationTo: "support-conversations",
        required: true,
        index: true,
      },
      text("dedupe", { required: true, unique: true }),
      {
        name: "author",
        type: "select",
        options: ["customer", "staff", "ai", "system"],
        required: true,
      },
      { name: "visibility", type: "select", options: ["public", "internal"], required: true },
      ...voiceMessageFields,
      { name: "staff", type: "relationship", relationTo: "staff" },
      { name: "text", type: "textarea", required: true, maxLength: 8000 },
      { name: "citations", type: "json" },
    ],
  },
  {
    ...base,
    slug: "support-runs",
    labels: { singular: "客服 AI 任务", plural: "客服 AI 任务" },
    fields: [
      {
        name: "conversation",
        type: "relationship",
        relationTo: "support-conversations",
        required: true,
        index: true,
      },
      text("dedupe", { required: true, unique: true }),
      { name: "task", type: "json" },
      { name: "revision", type: "number", required: true },
      {
        name: "status",
        type: "select",
        options: ["queued", "running", "succeeded", "failed", "discarded"],
        required: true,
        index: true,
      },
      text("lease"),
      { name: "leaseUntil", type: "date" },
      text("day", { index: true }),
      { name: "reserved", type: "number", defaultValue: 0 },
      { name: "usage", type: "json" },
      text("model"),
      { name: "error", type: "textarea" },
    ],
  },
];
