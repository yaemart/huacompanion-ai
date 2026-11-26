import type { CollectionConfig } from "payload";
const deny = () => false;
export const exhibitionReminderCollection: CollectionConfig = {
  slug: "exhibition-reminder-jobs",
  access: { create: deny, read: deny, update: deny, delete: deny },
  admin: { hidden: true },
  endpoints: false,
  lockDocuments: false,
  fields: [
    { name: "key", type: "text", required: true, unique: true, maxLength: 64 },
    { name: "scope", type: "text", required: true, index: true, maxLength: 115 },
    { name: "subscription", type: "relationship", relationTo: "subscriptions", required: true },
    { name: "body", type: "json", required: true },
  ],
};
