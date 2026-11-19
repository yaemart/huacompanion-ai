import type { CollectionConfig } from "payload";
import { locales } from "../../lib/locales";

const deny = () => false;
const internal = {
  access: { create: deny, read: deny, update: deny, delete: deny },
  admin: { hidden: true },
  endpoints: false,
  lockDocuments: false,
} satisfies Partial<CollectionConfig>;

export const subscriptionCollections: CollectionConfig[] = [
  {
    ...internal,
    slug: "subscription-campaign-grants",
    typescript: { interface: "SubscriptionCampaignGrant" },
    indexes: [{ fields: ["staff", "topic"], unique: true }],
    fields: [
      { name: "staff", type: "relationship", relationTo: "staff", required: true, index: true },
      { name: "topic", type: "select", options: ["policy-updates"], required: true },
      { name: "enabled", type: "checkbox", defaultValue: false, required: true },
      { name: "revision", type: "number", min: 1, defaultValue: 1, required: true },
      { name: "changedBy", type: "relationship", relationTo: "staff" },
    ],
  },
  {
    ...internal,
    slug: "subscriptions",
    typescript: { interface: "Subscription" },
    indexes: [{ fields: ["email", "topic"], unique: true }],
    fields: [
      { name: "email", type: "email", required: true },
      { name: "topic", type: "text", required: true, maxLength: 111 },
      { name: "locale", type: "select", options: [...locales], required: true },
      {
        name: "status",
        type: "select",
        options: ["pending", "confirmed", "unsubscribed"],
        required: true,
        defaultValue: "pending",
      },
      { name: "consentVersion", type: "number", min: 1, required: true },
      { name: "consentedAt", type: "date", required: true },
      { name: "privacyVersion", type: "text", required: true, maxLength: 100 },
      { name: "sourcePath", type: "text", required: true, maxLength: 256 },
      { name: "partnerCode", type: "text", maxLength: 100 },
      { name: "confirmedAt", type: "date" },
      { name: "unsubscribedAt", type: "date" },
    ],
  },
  {
    ...internal,
    slug: "subscription-credentials",
    typescript: { interface: "SubscriptionCredential" },
    fields: [
      {
        name: "subscription",
        type: "relationship",
        relationTo: "subscriptions",
        required: true,
        index: true,
      },
      { name: "purpose", type: "select", options: ["confirm", "unsubscribe"], required: true },
      { name: "tokenHash", type: "text", required: true, unique: true, maxLength: 64 },
      { name: "version", type: "number", min: 1, required: true },
      { name: "expiresAt", type: "date", required: true },
      { name: "consumedAt", type: "date" },
      { name: "policyRequestKey", type: "text" },
    ],
  },
  {
    ...internal,
    slug: "subscription-mail-jobs",
    typescript: { interface: "SubscriptionMailJob" },
    fields: [
      { name: "key", type: "text", unique: true, required: true },
      {
        name: "subscription",
        type: "relationship",
        relationTo: "subscriptions",
        required: true,
        index: true,
      },
      { name: "consentVersion", type: "number", min: 1, required: true },
      { name: "siteOrigin", type: "text", required: true },
      {
        name: "status",
        type: "select",
        options: ["queued", "running", "retry", "uncertain", "sent", "failed", "cancelled"],
        defaultValue: "queued",
        required: true,
      },
      { name: "attemptedAt", type: "json" },
      { name: "lease", type: "text" },
      { name: "messageHash", type: "text" },
      { name: "nextAt", type: "date" },
      { name: "policySelection", type: "json" },
      { name: "deliverPolicy", type: "checkbox", required: true, defaultValue: false },
    ],
  },
];
