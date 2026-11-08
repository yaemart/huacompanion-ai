import { PublicCompanySettings } from "./cms/company";
import { businessCollections } from "./cms/business/collections";
import { workflowCollections, workflowSettings } from "./cms/workflow/collections";
import { qualityCollections } from "./cms/quality/collections";
import { customerCollections, customerSettings } from "./cms/customer/collections";
import { voiceCollections } from "./cms/support/voice";
import { callCollections } from "./cms/support/callCollections";
import { operationsCollections } from "./cms/support/operations";
import { supportSettings } from "./cms/support/settings";
import { SEOSettings } from "./cms/seo";
import { supportCollections } from "./cms/support/collections";
import "dotenv/config";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { zh } from "@payloadcms/translations/languages/zh";
import { en } from "@payloadcms/translations/languages/en";
import path from "node:path";
import { contentCollections } from "./cms/content/collections";
import { sharedPolicyCollections } from "./cms/immigration/shared-collections";
import { ImmigrationPolicies } from "./cms/immigration/collections";
import { collections } from "./cms/collections";
const secret = process.env.PAYLOAD_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "PAYLOAD_SECRET must contain at least 32 random characters. Run npm run local:db first.",
  );
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
export default buildConfig({
  secret,
  serverURL: process.env.APP_URL || "http://127.0.0.1:3000",
  admin: {
    user: "staff",
    meta: { titleSuffix: " · 华伴管理后台" },
    importMap: { baseDir: path.resolve("src") },
    components: {
      beforeDashboard: ["/cms/Dashboard#Dashboard"],
      beforeNavLinks: ["/cms/ContentNav#ContentNav"],
    },
  },
  i18n: { supportedLanguages: { zh, en }, fallbackLanguage: "zh" },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL, max: 10 },
    push: process.env.APP_ENV === "local" && process.env.HUA_DEMO_SCHEMA_PUSH !== "false",
    migrationDir: path.resolve("src/migrations"),
  }),
  globals: [
    supportSettings,
    workflowSettings,
    customerSettings,
    SEOSettings,
    PublicCompanySettings,
  ],
  collections: [
    ...collections,
    ...contentCollections,
    ImmigrationPolicies,
    ...sharedPolicyCollections,
    ...supportCollections,
    ...voiceCollections,
    ...callCollections,
    ...operationsCollections,
    ...businessCollections,
    ...workflowCollections,
    ...qualityCollections,
    ...customerCollections,
  ],
  typescript: { outputFile: path.resolve("payload-types.ts") },
  csrf: [process.env.APP_URL || "http://127.0.0.1:3000"],
  graphQL: { disable: true },
  email: () => ({
    name: "unconfigured",
    defaultFromAddress: "unconfigured@huacompanion.invalid",
    defaultFromName: "华伴",
    sendEmail: async () => {
      throw new Error("邮件服务尚未配置，无法发送。请联系管理员。");
    },
  }),
});
