import type { CollectionConfig, GlobalConfig, Field } from "payload";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { isAdmin } from "../access";
const privateAccess = {
  create: () => false,
  update: () => false,
  delete: () => false,
  read: () => false,
};
const text = (name: string, extra: Record<string, unknown> = {}): Field =>
  ({ name, type: "text", ...extra }) as Field;
const date = (name: string): Field => ({ name, type: "date" });
const rel = (name: string, relationTo: string): Field =>
  ({ name, type: "relationship", relationTo, required: true, index: true }) as Field;
const base = { access: privateAccess, admin: { group: "客户身份", hidden: true } };
export const customerCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "customer-accounts",
    fields: [
      text("email", { unique: true, required: true }),
      date("verifiedAt"),
      { name: "active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    ...base,
    slug: "customer-challenges",
    fields: [
      text("email", { required: true, index: true }),
      text("handle", { required: true, unique: true }),
      text("tokenHash", { required: true }),
      date("expiresAt"),
      date("consumedAt"),
      { name: "attempts", type: "number", defaultValue: 0 },
    ],
  },
  {
    ...base,
    slug: "customer-sessions",
    fields: [
      rel("customer", "customer-accounts"),
      text("tokenHash", { required: true, unique: true }),
      date("expiresAt"),
      date("revokedAt"),
    ],
  },
  {
    ...base,
    slug: "customer-inquiry-links",
    fields: [
      rel("customer", "customer-accounts"),
      rel("inquiry", "inquiries"),
      { name: "conversation", type: "relationship", relationTo: "support-conversations" },
      rel("verifiedBy", "staff"),
      text("verificationReason", { required: true, maxLength: 2000 }),
      date("verifiedAt"),
      { name: "revokedBy", type: "relationship", relationTo: "staff" },
      date("revokedAt"),
      text("revocationReason"),
      { name: "active", type: "checkbox", defaultValue: true },
      text("dedupe", { required: true, unique: true }),
    ],
  },
];
export const customerSettings: GlobalConfig = {
  slug: "customer-settings",
  label: "客户中心设置",
  hooks: {
    beforeChange: [
      async ({ req, data }) => {
        const id = await req.transactionID;
        const { sessions } = req.payload.db as Pick<PostgresAdapter, "sessions">;
        if (!id || sessions?.[id] === undefined)
          throw Error("Customer settings require a transaction");
        await sessions[id].db.execute("SELECT pg_advisory_xact_lock(726281)");
        return data;
      },
    ],
  },
  access: { read: ({ req }) => isAdmin(req.user), update: ({ req }) => isAdmin(req.user) },
  fields: [
    {
      name: "enabled",
      label: "启用已验证客户登录（仍需邮件配置）",
      type: "checkbox",
      defaultValue: false,
    },
  ],
};
