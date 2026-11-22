import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import { customerEmail } from "../lib/customer";

/** Internal only: both local marketing and subscription mail use the same mailbox clock. */
export function subscriptionAttemptBudgetSQL(emails: string[]) {
  const normalized = [...new Set(emails.map(customerEmail))];
  const requested = normalized.map((email) => ({
    email,
    hash: createHash("sha256").update(email).digest("hex"),
  }));
  const marketing =
    process.env.APP_ENV === "local"
      ? sql`
    UNION ALL
    SELECT r.email, a.at::timestamptz AS at FROM requested r
    JOIN subscription_campaign_mock_slots s ON s.recipient_hash=r.hash
    JOIN subscription_campaign_mock_attempts m ON m.slot_id=s.id
    CROSS JOIN LATERAL jsonb_array_elements_text(m.attempted_at) a(at)
  `
      : sql``;
  return sql`
    WITH requested AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) AS r(email text,hash text)
    ), attempts AS (
      SELECT r.email, a.at::timestamptz AS at FROM requested r
      JOIN subscriptions s ON lower(btrim(s.email))=r.email
      JOIN subscription_mail_jobs j ON j.subscription_id=s.id
      CROSS JOIN LATERAL jsonb_array_elements_text(j.attempted_at) a(at)
      ${marketing}
    ), timeline AS (
      SELECT email, array_agg(at ORDER BY at DESC) AS times FROM attempts
      WHERE at > statement_timestamp()-interval '24 hours' GROUP BY email
    ), budget AS (
      SELECT email, greatest(times[1]+interval '15 minutes',
        CASE WHEN cardinality(times)>=5 THEN times[5]+interval '24 hours' END) AS next
      FROM timeline
    ) SELECT email, next::text FROM budget WHERE next > statement_timestamp()
  `;
}
