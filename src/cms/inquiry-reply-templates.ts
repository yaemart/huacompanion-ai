import type { CollectionConfig, PayloadRequest } from "payload";
import { replyCategories } from "../lib/inquiry-reply-templates";
import { isAdmin } from "./access";

const admin = ({ req }: { req: PayloadRequest }) => isAdmin(req.user);

function text<T extends "text" | "textarea">(
  name: string,
  label: string,
  type: T,
  maxLength: number,
) {
  return {
    name,
    label,
    type,
    required: true,
    maxLength,
    validate: (value: unknown) =>
      typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
        ? true
        : `请填写${label}，最多 ${maxLength} 字。`,
  };
}

export const inquiryReplyTemplates: CollectionConfig = {
  slug: "inquiry-reply-templates",
  lockDocuments: false,
  labels: { singular: "回复模板", plural: "回复模板库" },
  admin: {
    group: "业务运营",
    useAsTitle: "title",
    defaultColumns: ["title", "category", "enabled"],
    description:
      "每条模板填写中英文正文。只写可供客户查看的通用文字，请勿填写客户资料、内部成本或密钥。",
  },
  access: { admin, read: admin, create: admin, update: admin, delete: () => false },
  fields: [
    text("title", "模板名称", "text", 120),
    {
      name: "category",
      label: "分类",
      type: "select",
      options: [...replyCategories],
      required: true,
    },
    { name: "enabled", label: "供咨询页使用", type: "checkbox", defaultValue: true },
    text("bodyZh", "中文正文", "textarea", 4000),
    text("bodyEn", "英文正文", "textarea", 4000),
  ],
};
