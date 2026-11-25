import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { customerEmail } from "../lib/customer";
import { executeSQL } from "./db-types";

export type CampaignAudienceReader = () => ReturnType<typeof campaignAudience>;

/** Server-only eligibility snapshot; never include these rows in a client response. */
export async function campaignAudience(
  p: Payload,
  req: Partial<PayloadRequest>,
  recordingOutcome = false,
) {
  const privacy = process.env.PRIVACY_VERSION?.trim() || "";
  const { rows } = await executeSQL(
    p,
    (await req.transactionID)!,
    sql`
    SELECT id, email, locale, consent_version AS version, status, confirmed_at, privacy_version
    FROM subscriptions WHERE topic='policy-updates' ORDER BY consented_at DESC, id DESC
  `,
  );
  const suppressed = new Set(
    (
      await p.find({
        collection: "subscription-marketing-suppressions",
        req,
        depth: 0,
        pagination: false,
      })
    ).docs.map((row) => row.recipientHash),
  );
  const seen = new Set<string>();
  const recipients: { id: number; email: string; locale: string; version: number }[] = [];
  for (const row of rows as {
    id: number;
    email: string;
    locale: string;
    version: string;
    status: string;
    confirmed_at: string | null;
    privacy_version: string;
  }[]) {
    let email: string;
    try {
      email = customerEmail(row.email);
    } catch {
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const version = Number(row.version);
    if (
      (!recordingOutcome && suppressed.has(createHash("sha256").update(email).digest("hex"))) ||
      row.status !== "confirmed" ||
      !row.confirmed_at ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !privacy ||
      row.privacy_version !== privacy
    )
      continue;
    recipients.push({ id: row.id, email, locale: row.locale, version });
  }
  return recipients;
}
