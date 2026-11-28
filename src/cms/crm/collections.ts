import type { CollectionConfig, Field } from "payload";
const deny = () => false;
const text = (name: string, maxLength = 200): Extract<Field, { type: "text" }> => ({
  name,
  type: "text",
  maxLength,
});
const number = (name: string): Field => ({ name, type: "number", required: true, min: 1 });
const relation = (
  name: string,
  relationTo: "staff" | "teams" | "crm-clients",
  required = true,
): Field => ({ name, type: "relationship", relationTo, required });
const state: Field = {
  name: "status",
  type: "select",
  options: ["active", "archived"],
  required: true,
};
const base = {
  access: { create: deny, read: deny, update: deny, delete: deny },
  endpoints: false as const,
  graphQL: false as const,
  admin: { hidden: true },
  lockDocuments: false as const,
};
export const crmCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "crm-clients",
    fields: [
      { ...text("reference", 40), required: true, unique: true },
      { name: "kind", type: "select", options: ["individual", "company"], required: true },
      { ...text("displayName"), required: true },
      { name: "language", type: "select", options: ["en", "zh"], required: true },
      text("countryCode", 2),
      relation("team", "teams"),
      relation("owner", "staff", false),
      state,
      number("revision"),
    ],
  },
  {
    ...base,
    slug: "crm-contacts",
    fields: [
      relation("client", "crm-clients"),
      { ...text("name"), required: true },
      text("email", 254),
      text("phone", 100),
      text("jobTitle", 100),
      { name: "isPrimary", type: "checkbox", required: true, defaultValue: false },
      state,
      number("revision"),
    ],
  },
  {
    ...base,
    slug: "crm-operations",
    fields: [
      relation("actor", "staff"),
      { ...text("key", 80), required: true, unique: true },
      { ...text("operationKey", 36), required: true },
      { ...text("action", 32), required: true },
      { ...text("inputDigest", 64), required: true },
      { ...text("epoch", 64), required: true },
      { name: "result", type: "json", required: true },
    ],
  },
];
