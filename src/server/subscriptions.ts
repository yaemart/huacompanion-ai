import { createHash, randomBytes } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID } from "../cms/access";
import { isContentIdentifier } from "../lib/content-identifiers";
import { customerEmail } from "../lib/customer";
import { isLocale } from "../lib/locales";
import { executeSQL } from "./db-types";

const confirmationLifetime = 24 * 60 * 60 * 1000;
const topics = new Set(["policy-updates", "exhibition-alerts", "sourcing-guides"]);
const sourcePathPattern = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?)?$/i;

type SubscriptionConsent = {
  email: string;
  topic: string;
  locale: string;
  privacyVersion: string;
  sourcePath: string;
  partnerCode?: string;
};

function validateConsent(input: SubscriptionConsent) {
  const email = customerEmail(input.email);
  const { topic, locale, sourcePath, partnerCode } = input;
  const privacyVersion = input.privacyVersion.trim();
  if (
    !topics.has(topic) &&
    !(topic.startsWith("exhibition:") && isContentIdentifier(topic.slice(11)))
  )
    throw Error("Invalid subscription topic");
  if (!isLocale(locale) || !privacyVersion || privacyVersion.length > 100)
    throw Error("Missing subscription language or privacy version");
  if (sourcePath.length > 256 || !sourcePathPattern.test(sourcePath))
    throw Error("Invalid subscription source path");
  if (partnerCode !== undefined && !isContentIdentifier(partnerCode))
    throw Error("Invalid subscription partner code");
  return { email, topic, locale, privacyVersion, sourcePath, partnerCode: partnerCode ?? null };
}

function confirmationDigest(token: string) {
  return createHash("sha256").update("subscription:confirm:").update(token).digest("hex");
}

async function subscriptionTransaction<T>(
  payload: Payload,
  work: (req: { transactionID: string | number }) => Promise<T>,
): Promise<T> {
  const transactionID = await payload.db.beginTransaction();
  if (!transactionID) throw Error("Subscription transactions required");
  try {
    const result = await work({ transactionID });
    await payload.db.commitTransaction(transactionID);
    return result;
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

// Both issuance and consumption serialize for this email and topic, including first issuance.
async function lockSubscription(
  payload: Payload,
  transactionID: number | string,
  email: string,
  topic: string,
) {
  const key = JSON.stringify(["subscription", email, topic]);
  await executeSQL(
    payload,
    transactionID,
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** Internal only. The caller owns the transient value for later one-to-one delivery. */
export async function startSubscription(payload: Payload, input: SubscriptionConsent) {
  const data = validateConsent(input);
  return subscriptionTransaction(payload, async (req) => {
    await lockSubscription(payload, req.transactionID, data.email, data.topic);
    const {
      docs: [existing],
    } = await payload.find({
      collection: "subscriptions",
      where: { and: [{ email: { equals: data.email } }, { topic: { equals: data.topic } }] },
      limit: 1,
      depth: 0,
      req,
    });
    if (existing?.status === "confirmed") return null;
    const now = Date.now();
    const values = {
      ...data,
      status: "pending" as const,
      consentedAt: new Date(now).toISOString(),
      consentVersion: (existing?.consentVersion ?? 0) + 1,
      confirmedAt: null,
      unsubscribedAt: null,
    };
    const subscription = existing
      ? await payload.update({ collection: "subscriptions", id: existing.id, data: values, req })
      : await payload.create({ collection: "subscriptions", data: values, req });

    const token = randomBytes(32).toString("hex");
    await payload.create({
      collection: "subscription-credentials",
      data: {
        subscription: subscription.id,
        purpose: "confirm",
        tokenHash: confirmationDigest(token),
        version: subscription.consentVersion,
        expiresAt: new Date(now + confirmationLifetime).toISOString(),
      },
      req,
    });
    return token;
  });
}

/** Returns only success or rejection. Confirmation and consumption commit together. */
export async function confirmSubscription(payload: Payload, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  return subscriptionTransaction(payload, async (req) => {
    const {
      docs: [match],
    } = await payload.find({
      collection: "subscription-credentials",
      where: { tokenHash: { equals: confirmationDigest(token) } },
      limit: 1,
      depth: 0,
      req,
    });
    if (!match || match.purpose !== "confirm" || match.consumedAt) return false;
    const id = relationID(match.subscription);
    const initial = await payload.findByID({ collection: "subscriptions", id, depth: 0, req });
    await lockSubscription(payload, req.transactionID, initial.email, initial.topic);
    const record = await payload.findByID({ collection: "subscriptions", id, depth: 0, req });
    const credential = await payload.findByID({
      collection: "subscription-credentials",
      id: match.id,
      depth: 0,
      req,
    });
    const now = Date.now();
    if (
      record.status !== "pending" ||
      credential.version !== record.consentVersion ||
      credential.purpose !== "confirm" ||
      credential.consumedAt ||
      !(Date.parse(credential.expiresAt) > now)
    )
      return false;

    const confirmedAt = new Date(now).toISOString();
    await payload.update({
      collection: "subscription-credentials",
      id: credential.id,
      data: { consumedAt: confirmedAt },
      req,
    });
    await payload.update({
      collection: "subscriptions",
      id,
      data: { status: "confirmed", confirmedAt },
      req,
    });
    return true;
  });
}
