import { APIError, type GlobalConfig } from "payload";
import { isAdmin, relationID } from "./access";
import { lockBusiness } from "../server/business/hooks";

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
  hooks: {
    beforeOperation: [
      async ({ args, operation, overrideAccess, req }) => {
        if (operation !== "update" || (!overrideAccess && !isAdmin(req.user))) return;
        await lockBusiness(req);
        if (!overrideAccess && Object.hasOwn(args.data, "allowQuoteCollection")) {
          const id = relationID(req.user);
          const actor =
            id && (await req.payload.findByID({ collection: "staff", id, req, depth: 0 }));
          if (!actor || !isAdmin(actor)) throw new APIError("仅管理员可修改代收设置", 403);
        }
      },
    ],
    afterChange: [
      async ({ doc, data, previousDoc, req }) => {
        if (!Object.hasOwn(data, "allowQuoteCollection")) return doc;
        const before = previousDoc?.allowQuoteCollection === true;
        const after = data.allowQuoteCollection === true;
        if (before !== after)
          await req.payload.create({
            collection: "audit-events",
            req,
            data: {
              entity: "public-company-settings",
              recordId: String(doc.id),
              action: "quote-collection-setting",
              actor: isAdmin(req.user) ? Number(relationID(req.user)) : undefined,
              before: { allowQuoteCollection: before },
              after: { allowQuoteCollection: after },
            },
          });
        return doc;
      },
    ],
  },
  fields: [
    { name: "companyName", label: "公司主体正式名称（两语共用）", type: "text", maxLength: 200 },
    {
      name: "allowQuoteCollection",
      label: "允许华伴代收第三方款项",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "报价设置。仅在律师确认业务边界后启用。" },
    },
    { name: "locationZh", label: "所在地（中文）", type: "text", maxLength: 300 },
    { name: "locationEn", label: "所在地（英文）", type: "text", maxLength: 300 },
    { name: "email", label: "公开联系邮箱", type: "email" },
    { name: "phone", label: "公开联系电话（含区号）", type: "text", maxLength: 100 },
  ],
};
