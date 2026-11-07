import type { CollectionConfig, Field } from "payload";
const access = { read: () => false, create: () => false, update: () => false, delete: () => false };
const text = (name: string, extra: object = {}): Field =>
  ({ name, type: "text", ...extra }) as Field;
export const callCollections: CollectionConfig[] = [
  {
    slug: "support-calls",
    access,
    admin: { hidden: true },
    fields: [
      {
        name: "conversation",
        type: "relationship",
        relationTo: "support-conversations",
        required: true,
        index: true,
      },
      text("dedupe", { unique: true, required: true }),
      text("gatewayID", { unique: true, required: true }),
      { name: "kind", type: "select", options: ["ai", "human"], required: true },
      {
        name: "state",
        type: "select",
        options: ["queued", "connecting", "active", "ended", "expired", "failed"],
        required: true,
        index: true,
      },
      { name: "owner", type: "relationship", relationTo: "staff" },
      { name: "staffJoined", type: "checkbox", defaultValue: false },
      { name: "claimUntil", type: "date" },
      { name: "expiresAt", type: "date", required: true, index: true },
      text("day", { index: true }),
      { name: "reservedSeconds", type: "number", required: true },
      { name: "reservedCents", type: "number", required: true },
      { name: "aiBridge", type: "checkbox", defaultValue: false },
      { name: "cleanupPending", type: "checkbox", defaultValue: false },
      { name: "rejectedStaff", type: "json" },
    ],
  },
  {
    slug: "support-call-presence",
    access,
    admin: { hidden: true },
    fields: [
      text("staffKey", { required: true, unique: true }),
      { name: "staff", type: "relationship", relationTo: "staff", required: true },
      {
        name: "state",
        type: "select",
        options: ["available", "busy", "away", "offline"],
        required: true,
      },
      { name: "heartbeatAt", type: "date", required: true },
      { name: "languages", type: "json", required: true },
      { name: "capacity", type: "number", required: true, min: 1, max: 3 },
    ],
  },
];
