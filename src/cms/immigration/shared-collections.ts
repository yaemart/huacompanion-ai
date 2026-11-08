import type { CollectionConfig, Field, CollectionBeforeChangeHook } from "payload";
import { isAdmin } from "../access.ts";
import { validateSharedFacts } from "../../lib/policy-shared-facts.ts";
import { policyTestCountriesAllowed } from "../../lib/immigration-policy-entry.ts";
const closed = () => false;
const access: NonNullable<CollectionConfig["access"]> = {
  admin: closed,
  read: ({ req }) => isAdmin(req.user),
  create: closed,
  update: closed,
  delete: closed,
};
const immutable: CollectionBeforeChangeHook = ({ operation }) => {
  if (operation === "update") throw Error("正式政策版本不可修改，请另建版本并重新审核");
};
const group = (): Field => ({
  name: "group",
  type: "relationship",
  relationTo: "policy-groups",
  required: true,
});
const revision = (): Field => ({
  name: "revision",
  type: "number",
  min: 1,
  required: true,
  defaultValue: 1,
});
const locale = (): Field => ({
  name: "locale",
  type: "text",
  required: true,
  validate: (value: unknown) => value === "en" || value === "zh" || "语言仅支持中英文",
});
const factRef = (name: string): Field => ({
  name,
  type: "relationship",
  relationTo: "policy-fact-versions",
});
const reviewFields = (): Field[] => [
  {
    name: "reviewState",
    type: "select",
    options: ["draft", "review", "returned", "approved"],
    required: true,
    defaultValue: "draft",
  },
  { name: "contributors", type: "json", defaultValue: [] },
  { name: "lastEditedBy", type: "number" },
  { name: "submittedBy", type: "number" },
  { name: "reviewNote", type: "textarea" },
];
const approvalFields = (): Field[] => [
  { name: "sourceRevision", type: "number", min: 1, required: true },
  { name: "approvedBy", type: "number", min: 1, required: true },
  { name: "contributors", type: "json", required: true },
  { name: "overrideReason", type: "textarea" },
];
const identityFields = (): Field[] => [
  { name: "title", type: "text", required: true, maxLength: 200 },
  { name: "slug", type: "text", required: true, maxLength: 100 },
  { name: "publicNotes", type: "textarea", maxLength: 4000 },
];
const base = { access, admin: { hidden: true, group: "内容中心" } };
const versionHooks: CollectionConfig["hooks"] = {
  beforeChange: [immutable],
  beforeDelete: [
    () => {
      throw Error("正式政策版本不可删除");
    },
  ],
};
export const sharedPolicyCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "policy-groups",
    typescript: { interface: "PolicyGroup" },
    fields: [
      { name: "contentKey", type: "text", required: true, unique: true, maxLength: 100 },
      revision(),
      factRef("activeFactVersion"),
    ],
  },
  {
    ...base,
    slug: "policy-fact-drafts",
    typescript: { interface: "PolicyFactDraft" },
    indexes: [{ fields: ["group"], unique: true }],
    fields: [
      group(),
      revision(),
      { name: "facts", type: "json", required: true },
      ...reviewFields(),
    ],
  },
  {
    ...base,
    slug: "policy-fact-versions",
    typescript: { interface: "PolicyFactVersion" },
    hooks: versionHooks,
    indexes: [{ fields: ["group", "revision"], unique: true }],
    fields: [
      group(),
      revision(),
      {
        name: "facts",
        type: "json",
        required: true,
        validate: (value) => {
          try {
            const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
              new Date(),
            );
            validateSharedFacts(value, today, policyTestCountriesAllowed(process.env));
            return true;
          } catch (error) {
            return error instanceof Error ? error.message : "共用事实无效";
          }
        },
      },
      ...approvalFields(),
    ],
  },
  {
    ...base,
    slug: "policy-note-drafts",
    typescript: { interface: "PolicyNoteDraft" },
    indexes: [
      { fields: ["group", "locale"], unique: true },
      { fields: ["locale", "slug"], unique: true },
    ],
    fields: [
      group(),
      locale(),
      revision(),
      ...identityFields(),
      factRef("basedOnFactVersion"),
      { name: "publishedNoteVersion", type: "relationship", relationTo: "policy-note-versions" },
      { name: "needsReview", type: "checkbox", required: true, defaultValue: true },
      ...reviewFields(),
    ],
  },
  {
    ...base,
    slug: "policy-note-versions",
    typescript: { interface: "PolicyNoteVersion" },
    hooks: versionHooks,
    indexes: [{ fields: ["group", "locale", "revision"], unique: true }],
    fields: [
      group(),
      locale(),
      revision(),
      ...identityFields(),
      { ...factRef("basedOnFactVersion"), required: true } as Field,
      ...approvalFields(),
    ],
  },
];
