import type { GlobalConfig } from "payload";
import { isAdmin } from "./access.ts";
import { locales, localeNames } from "../lib/locales.ts";
import { seoPages } from "../lib/seo.ts";
import type { SeoSetting } from "../../payload-types";

export const SEOSettings: GlobalConfig = {
  slug: "seo-settings",
  label: "页面搜索展示",
  admin: {
    group: "内容中心",
    description:
      "管理员维护目录、表单及固定页面的 SEO。保存后生效；留空沿用已发布内容及默认值。内容详情页的 SEO 请在内容工作台编辑并审核发布。试运行仍禁止收录。",
  },
  access: {
    read: ({ req }) => isAdmin(req.user),
    update: ({ req }) => isAdmin(req.user),
  },
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        const keys = new Set<string>();
        const pages: SeoSetting["pages"] = data.pages;
        for (const page of pages || []) {
          const key = `${page.locale}:${page.path}`;
          if (keys.has(key)) throw Error("同一语言和页面只能设置一次搜索展示");
          keys.add(key);
          if (page.seoImage) {
            await req.payload.findByID({
              collection: "content-media",
              id: typeof page.seoImage === "number" ? page.seoImage : page.seoImage.id,
              depth: 0,
              overrideAccess: false,
              user: req.user,
              req,
            });
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "pages",
      label: "页面 SEO 设置",
      type: "array",
      maxRows: 105,
      fields: [
        {
          name: "path",
          label: "页面",
          type: "select",
          required: true,
          options: seoPages.map((page) => ({ value: page.path || "home", label: page.label })),
        },
        {
          name: "locale",
          label: "语言",
          type: "select",
          required: true,
          options: locales.map((locale) => ({ value: locale, label: localeNames[locale] })),
        },
        { name: "seoTitle", label: "搜索标题", type: "text", maxLength: 200 },
        { name: "seoDescription", label: "搜索摘要", type: "textarea", maxLength: 500 },
        {
          name: "seoImage",
          label: "分享图片",
          type: "relationship",
          relationTo: "content-media",
          admin: { description: "此处明确选择的图片会作为公开分享图片提供访问。" },
        },
      ],
    },
  ],
};
