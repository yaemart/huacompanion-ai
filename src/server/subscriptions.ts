import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID } from "../cms/access";
import { isContentIdentifier } from "../lib/content-identifiers";
import { customerEmail } from "../lib/customer";
import { isLocale } from "../lib/locales";
import { isSubscriptionToken, type SubscriptionAction } from "../lib/subscription-action";
import { executeSQL } from "./db-types";
import { effectiveExhibitionStatus, type Exhibition } from "../lib/exhibitions";

const day = 24 * 60 * 60 * 1000;
export const credentialLifetimes = { confirm: day, unsubscribe: 365 * day };
const topics = new Set(["policy-updates", "exhibition-alerts", "sourcing-guides"]);
const sourcePathPattern = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?)?$/i;

export type SubscriptionConsent = {
  email: string;
  topic: string;
  locale: string;
  privacyVersion: string;
  sourcePath: string;
  partnerCode?: string;
};

export class SubscriptionInputError extends Error {}

function validateConsent(input: SubscriptionConsent) {
  let email: string;
  try {
    email = customerEmail(input.email);
  } catch {
    throw new SubscriptionInputError("Invalid subscription email");
  }
  const { topic, locale, sourcePath, partnerCode } = input;
  const privacyVersion = input.privacyVersion.trim();
  if (
    !topics.has(topic) &&
    !(topic.startsWith("exhibition:") && isContentIdentifier(topic.slice(11)))
  )
    throw new SubscriptionInputError("Invalid subscription topic");
  if (!isLocale(locale) || !privacyVersion || privacyVersion.length > 100)
    throw new SubscriptionInputError("Missing subscription language or privacy version");
  if (sourcePath.length > 256 || !sourcePathPattern.test(sourcePath))
    throw new SubscriptionInputError("Invalid subscription source path");
  if (partnerCode !== undefined && !isContentIdentifier(partnerCode))
    throw new SubscriptionInputError("Invalid subscription partner code");
  return { email, topic, locale, privacyVersion, sourcePath, partnerCode: partnerCode ?? null };
}

export function credentialDigest(purpose: SubscriptionAction, token: string) {
  return createHash("sha256").update(`subscription:${purpose}:`).update(token).digest("hex");
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
  const key = subscriptionLockKey(email, topic);
  await executeSQL(
    payload,
    transactionID,
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

export function subscriptionLockKey(email: string, topic: string) {
  return JSON.stringify(["subscription", email, topic]);
}

async function stageSubscription(
  payload: Payload,
  data: ReturnType<typeof validateConsent>,
  req: { transactionID: string | number },
) {
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
  const values = {
    ...data,
    status: "pending" as const,
    consentedAt: new Date().toISOString(),
    consentVersion: (existing?.consentVersion ?? 0) + 1,
    confirmedAt: null,
    unsubscribedAt: null,
  };
  return existing
    ? payload.update({ collection: "subscriptions", id: existing.id, data: values, req })
    : payload.create({ collection: "subscriptions", data: values, req });
}

export async function queueSubscription(
  payload: Payload,
  input: SubscriptionConsent,
  siteOrigin: string,
) {
  const data = validateConsent(input);
  const key = await subscriptionTransaction(payload, async (req) => {
    if (data.topic.startsWith("exhibition:")) {
      const live = await executeSQL(
        payload,
        req.transactionID,
        sql`
        SELECT body->'exhibition' AS exhibition
        FROM content_published WHERE active = true AND body->>'kind' = 'exhibition'
          AND body->>'locale' = ${data.locale} AND body->>'contentKey' = ${data.topic.slice(11)} LIMIT 1
      `,
      );
      const exhibition = live.rows[0]?.exhibition as Exhibition | undefined;
      if (!exhibition || ["cancelled", "ended"].includes(effectiveExhibitionStatus(exhibition)))
        throw new SubscriptionInputError("Exhibition unavailable for subscription");
    }
    // The empty topic is reserved for the email-wide quota lock.
    await lockSubscription(payload, req.transactionID, data.email, "");
    const result = await executeSQL(
      payload,
      req.transactionID,
      sql`
      SELECT count(*) >= 5 OR COALESCE(max(j.created_at) > statement_timestamp() - interval '15 minutes', false) AS blocked
      FROM subscription_mail_jobs j JOIN subscriptions s ON s.id = j.subscription_id
      WHERE s.email = ${data.email} AND j.created_at > statement_timestamp() - interval '24 hours'
    `,
    );
    if (result.rows[0]?.blocked) return;
    const subscription = await stageSubscription(payload, data, req);
    if (!subscription) return;
    const key = randomUUID();
    await executeSQL(
      payload,
      req.transactionID,
      sql`
      INSERT INTO subscription_mail_jobs (subscription_id, consent_version, key, site_origin, created_at, updated_at)
      VALUES (${subscription.id}, ${subscription.consentVersion}, ${key}, ${siteOrigin}, statement_timestamp(), statement_timestamp())
    `,
    );
    return key;
  });
  if (key) {
    // A Payload adapter may swallow a COMMIT error. Verify the queue row outside its transaction.
    const job = await payload.count({
      collection: "subscription-mail-jobs",
      where: { key: { equals: key } },
    });
    if (job.totalDocs !== 1) throw Error("Subscription queue was not committed");
  }
}

/** Internal only. The caller owns the transient value for isolated verification. */
export async function startSubscription(payload: Payload, input: SubscriptionConsent) {
  const data = validateConsent(input);
  return subscriptionTransaction(payload, async (req) => {
    const subscription = await stageSubscription(payload, data, req);
    if (!subscription) return null;
    const now = Date.parse(subscription.consentedAt);
    const tokens = {
      confirm: randomBytes(32).toString("hex"),
      unsubscribe: randomBytes(32).toString("hex"),
    };
    for (const purpose of ["confirm", "unsubscribe"] as const)
      await payload.create({
        collection: "subscription-credentials",
        data: {
          subscription: subscription.id,
          purpose,
          tokenHash: credentialDigest(purpose, tokens[purpose]),
          version: subscription.consentVersion,
          expiresAt: new Date(now + credentialLifetimes[purpose]).toISOString(),
        },
        req,
      });
    return tokens;
  });
}

async function consumeSubscriptionCredential(
  payload: Payload,
  purpose: SubscriptionAction,
  token: unknown,
): Promise<boolean> {
  if (!isSubscriptionToken(token)) return false;
  const {
    docs: [match],
  } = await payload.find({
    collection: "subscription-credentials",
    where: { tokenHash: { equals: credentialDigest(purpose, token) } },
    limit: 1,
    depth: 0,
  });
  if (
    !match ||
    match.purpose !== purpose ||
    match.consumedAt ||
    !(Date.parse(match.expiresAt) > Date.now())
  )
    return false;
  const consumedAt = await subscriptionTransaction(payload, async (req) => {
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
      record.status === "unsubscribed" ||
      (purpose === "confirm" && record.status !== "pending") ||
      credential.version !== record.consentVersion ||
      credential.purpose !== purpose ||
      credential.consumedAt ||
      !(Date.parse(credential.expiresAt) > now)
    )
      return null;

    const at = new Date(now).toISOString();
    await payload.update({
      collection: "subscription-credentials",
      id: credential.id,
      data: { consumedAt: at },
      req,
    });
    await payload.update({
      collection: "subscriptions",
      id,
      data:
        purpose === "confirm"
          ? { status: "confirmed", confirmedAt: at }
          : { status: "unsubscribed", unsubscribedAt: at },
      req,
    });
    return at;
  });
  if (!consumedAt) return false;
  const committed = await payload.findByID({
    collection: "subscription-credentials",
    id: match.id,
    depth: 0,
  });
  if (committed.consumedAt !== consumedAt) throw Error("Subscription action was not committed");
  return true;
}

export function confirmSubscription(payload: Payload, token: unknown) {
  return consumeSubscriptionCredential(payload, "confirm", token);
}

export function unsubscribeSubscription(payload: Payload, token: unknown) {
  return consumeSubscriptionCredential(payload, "unsubscribe", token);
}
