import type { CollectionConfig, Field } from "payload";
const deny = () => false;
const base = {
  access: { create: deny, read: deny, update: deny, delete: deny },
  endpoints: false as const,
  graphQL: false as const,
  admin: { hidden: true },
  lockDocuments: false as const,
};
const text = (
  name: string,
  maxLength = 200,
  required = true,
): Extract<Field, { type: "text" }> => ({
  name,
  type: "text",
  maxLength,
  required,
});
const relation = (
  name: string,
  relationTo: "staff" | "crm-clients" | "inquiries" | "crm-followups",
  required = true,
): Extract<Field, { type: "relationship" }> => ({
  name,
  type: "relationship",
  relationTo,
  required,
});
const num = (name: string): Field => ({ name, type: "number", required: true, min: 1 });
export const followupCollections: CollectionConfig[] = [
  {
    ...base,
    slug: "crm-followups",
    fields: [
      { ...text("reference", 40), unique: true },
      { name: "anchorKind", type: "select", options: ["client", "inquiry"], required: true },
      relation("client", "crm-clients", false),
      relation("inquiry", "inquiries", false),
      { name: "type", type: "select", options: ["primary", "adhoc"], required: true },
      text("title"),
      text("description", 2000, false),
      relation("assignee", "staff", false),
      { name: "dueAt", type: "date", required: true },
      {
        name: "state",
        type: "select",
        options: ["pending", "completed", "canceled"],
        required: true,
      },
      { name: "needsReview", type: "checkbox", required: true, defaultValue: false },
      num("revision"),
      relation("createdBy", "staff"),
      relation("terminalBy", "staff", false),
      { name: "terminalAt", type: "date" },
    ],
  },
  {
    ...base,
    slug: "crm-followup-events",
    fields: [
      relation("task", "crm-followups"),
      num("seq"),
      text("action", 40),
      relation("actor", "staff"),
      { name: "serverTime", type: "date", required: true },
      { name: "details", type: "json", required: true },
    ],
  },
  {
    ...base,
    slug: "crm-followup-slots",
    fields: [
      { ...relation("inquiry", "inquiries"), unique: true },
      { ...text("sourceKey", 80), unique: true },
      num("generation"),
      num("revision"),
      relation("currentTask", "crm-followups", false),
      { name: "provenance", type: "json", required: true },
    ],
  },
];
