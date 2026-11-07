import type { CollectionConfig } from "payload";
import { contentScope } from "../access";
export { contentQualityHook } from "./hooks";
const closed = () => false;
export const qualityCollections: CollectionConfig[] = [
  {
    slug: "content-quality",
    labels: { singular: "内容质量", plural: "内容质量" },
    admin: {
      group: "内容中心",
      useAsTitle: "title",
      description: "在内容质量工作台登记来源、负责人和复核。复核不替代发布审核。",
    },
    access: {
      read: ({ req }) => contentScope(req.user),
      create: closed,
      update: closed,
      delete: closed,
    },
    fields: [
      { name: "draftId", type: "number", unique: true, required: true },
      { name: "title", type: "text", required: true },
      { name: "kind", type: "text", required: true },
      { name: "contentKey", type: "text", required: true },
      { name: "locale", type: "text", required: true },
      { name: "owner", type: "relationship", relationTo: "staff" },
      {
        name: "state",
        type: "select",
        required: true,
        defaultValue: "review-needed",
        options: ["review-needed", "checked"],
      },
      { name: "contentVersion", type: "text", required: true },
      { name: "checkedRevision", type: "number" },
      { name: "checkedAt", type: "date" },
      { name: "nextReviewAt", type: "date" },
      { name: "sourceVersion", type: "text" },
      { name: "sourceDraft", type: "number" },
      { name: "sourceIds", type: "json" },
      { name: "reason", type: "textarea" },
      { name: "checkedBy", type: "number" },
    ],
  },
  {
    slug: "content-quality-events",
    labels: { singular: "内容复核记录", plural: "内容复核记录" },
    admin: { group: "内容中心" },
    access: {
      read: ({ req }) => contentScope(req.user),
      create: closed,
      update: closed,
      delete: closed,
    },
    fields: [
      { name: "draftId", type: "number", required: true },
      { name: "kind", type: "text", required: true },
      { name: "actor", type: "number", required: true },
      { name: "revision", type: "number", required: true },
      { name: "reason", type: "textarea", required: true },
      { name: "sourceIds", type: "json", required: true },
      { name: "nextReviewAt", type: "date", required: true },
      { name: "sourceVersion", type: "text" },
    ],
  },
];
