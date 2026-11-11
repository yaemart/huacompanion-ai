import { ValidationError, type GlobalConfig } from "payload";
import { quoteTemplates } from "../../lib/quote-templates";
import { serviceCategoryOptions } from "../../lib/routes";
import { transactionSession } from "../../server/db-types";
import { isAdmin } from "../access";

export const quoteTemplateSettings: GlobalConfig = {
  slug: "quote-template-settings",
  label: "报价模板",
  admin: {
    group: "业务运营",
    description: "每类服务可保存一份模板。只填写可给客户看的文字，修改不会更新已保存的报价。",
  },
  access: {
    read: ({ req }) => isAdmin(req.user),
    update: ({ req }) => isAdmin(req.user),
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation, overrideAccess, req }) => {
        if (operation !== "update" || (!overrideAccess && !isAdmin(req.user))) return;
        const data: Record<string, unknown> = args.data;
        if (Object.hasOwn(data, "templates")) {
          // Payload's array editor sends 0 when the last row is removed.
          if (data.templates === 0 || data.templates === "0") data.templates = [];
          try {
            if (!Array.isArray(data.templates)) throw Error("报价模板必须是列表");
            quoteTemplates(data.templates);
          } catch (error) {
            throw new ValidationError({
              global: "quote-template-settings",
              errors: [{ path: "templates", message: (error as Error).message }],
              req,
            });
          }
        }
        // Serialize updates before Payload reads whether this Global already exists.
        const id = await req.transactionID;
        if (!id) throw Error("报价模板保存需要数据库事务");
        await transactionSession(req.payload, id).db.execute(
          "SELECT pg_advisory_xact_lock(726286)",
        );
      },
    ],
  },
  fields: [
    {
      name: "templates",
      label: "按服务类型维护",
      type: "array",
      maxRows: serviceCategoryOptions.length,
      labels: { singular: "服务模板", plural: "服务模板" },
      fields: [
        {
          name: "category",
          label: "服务类型",
          type: "select",
          required: true,
          options: serviceCategoryOptions,
        },
        { name: "enabled", label: "供新报价使用", type: "checkbox", defaultValue: true },
        { name: "included", label: "包含项目", type: "textarea", required: true, maxLength: 4000 },
        {
          name: "excluded",
          label: "不包含项目",
          type: "textarea",
          required: true,
          maxLength: 4000,
        },
        {
          name: "terms",
          label: "变更与取消规则",
          type: "textarea",
          required: true,
          maxLength: 4000,
        },
      ],
    },
  ],
};
