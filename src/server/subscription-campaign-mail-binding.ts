import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { contentTransaction, ContentError } from "./content/service";
import { requireSubscriptionAdmin } from "./subscription-management";
import { executeSQL } from "./db-types";
import { subscriptionLockKey } from "./subscriptions";
import { customerEmail } from "../lib/customer";
export async function bindLocalCampaignMail(p: Payload, actor: Staff, value: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟邮件绑定。", 403);
  const v = value as { emailId: string; attemptId: number; email: string };
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !["emailId", "attemptId", "email"].includes(k)) ||
    typeof v.emailId !== "string" ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.emailId) ||
    !Number.isSafeInteger(v.attemptId) ||
    v.attemptId < 1
  )
    throw new ContentError("模拟邮件绑定无效。", 400);
  let email: string;
  try {
    email = customerEmail(v.email);
  } catch {
    throw new ContentError("虚构邮箱无效。", 400);
  }
  if (!email.endsWith("@example.invalid")) throw new ContentError("仅支持虚构邮箱。", 400);
  const recipientHash = createHash("sha256").update(email).digest("hex");
  await contentTransaction(p, async (req) => {
    await executeSQL(p, req.transactionID, sql`SELECT pg_advisory_xact_lock(726281)`);
    const admin = await requireSubscriptionAdmin(p, actor, req);
    await executeSQL(
      p,
      req.transactionID,
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${subscriptionLockKey(email, "")},0))`,
    );
    const existing = (
      await p.find({
        collection: "subscription-campaign-mail-bindings",
        req,
        depth: 0,
        limit: 1,
        where: { or: [{ emailId: { equals: v.emailId } }, { attempt: { equals: v.attemptId } }] },
      })
    ).docs[0];
    if (existing) {
      if (
        existing.emailId !== v.emailId ||
        relationID(existing.attempt) !== v.attemptId ||
        existing.recipientHash !== recipientHash
      )
        throw new ContentError("模拟邮件已有不同绑定。", 409);
      return;
    }
    const { rows } = await executeSQL(
      p,
      req.transactionID,
      sql`
      SELECT a.key,a.attempted_at,j.recipient_hash,j.campaign_key FROM subscription_campaign_mock_attempts a
      JOIN subscription_campaign_mock_slots s ON s.id=a.slot_id JOIN subscription_campaign_jobs j ON j.id=s.job_id
      JOIN subscription_campaign_batches b ON b.id=s.batch_id AND b.id=j.batch_id AND b.campaign_key=j.campaign_key WHERE a.id=${v.attemptId}`,
    );
    const row = rows[0];
    if (!row) throw new ContentError("找不到原模拟尝试。", 404);
    if (
      row.recipient_hash !== recipientHash ||
      row.key !==
        createHash("sha256")
          .update(`mock-campaign-v1:${row.campaign_key}:${recipientHash}`)
          .digest("hex") ||
      !Array.isArray(row.attempted_at) ||
      !row.attempted_at.length
    )
      throw new ContentError("模拟邮件与原收件任务不匹配。", 409);
    const mail = await p.create({
      collection: "subscription-campaign-mail-bindings",
      req,
      depth: 0,
      data: { emailId: v.emailId, attempt: v.attemptId, recipientHash },
    });
    await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "subscription-campaign-mail-bindings",
        recordId: String(mail.id),
        actor: admin.id,
        action: "bind-mail-local",
        fields: "attempt",
        after: { attemptId: v.attemptId },
      },
    });
  });
}
