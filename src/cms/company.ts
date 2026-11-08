import type { GlobalConfig } from "payload";
import { isAdmin } from "./access";

export const PublicCompanySettings: GlobalConfig = {
  slug: "public-company-settings",
  label: "公开公司信息",
  admin: {
    group: "内容中心",
    description:
      "仅管理员填写经核实可公开的真实资料，保存后首页显示。留空不展示；不要填写私人联系方式或测试占位。所在地按中英文分别填写。",
  },
  access: {
    read: ({ req }) => isAdmin(req.user),
    update: ({ req }) => isAdmin(req.user),
  },
  fields: [
    { name: "companyName", label: "公司主体正式名称（两语共用）", type: "text", maxLength: 200 },
    { name: "locationZh", label: "所在地（中文）", type: "text", maxLength: 300 },
    { name: "locationEn", label: "所在地（英文）", type: "text", maxLength: 300 },
    { name: "email", label: "公开联系邮箱", type: "email" },
    { name: "phone", label: "公开联系电话（含区号）", type: "text", maxLength: 100 },
  ],
};
