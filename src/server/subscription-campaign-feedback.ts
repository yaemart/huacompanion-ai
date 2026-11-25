import { verifyFeedbackSignature, parseFeedbackEvent } from "../lib/subscription-feedback-webhook";
import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { relationID, type Staff } from "../cms/access";
import { customerEmail } from "../lib/customer";
import { contentTransaction, ContentError } from "./content/service";
import { executeSQL } from "./db-types";
import { requireSubscriptionAdmin } from "./subscription-management";
import { subscriptionLockKey } from "./subscriptions";

type Feedback = {
  eventId: string;
  attemptId: number;
  email: string;
  kind: "delivered" | "hard-bounce" | "complaint";
  occurredAt: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function inputFor(value: unknown): Feedback {
  const v = value as Feedback | null;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) => !["eventId", "attemptId", "email", "kind", "occurredAt"].includes(k),
    ) ||
    typeof v.eventId !== "string" ||
    !uuid.test(v.eventId) ||
    !Number.isSafeInteger(v.attemptId) ||
    v.attemptId <= 0 ||
    v.attemptId > 2147483647 ||
    !["delivered", "hard-bounce", "complaint"].includes(v.kind) ||
    typeof v.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(v.occurredAt)) ||
    new Date(v.occurredAt).toISOString() !== v.occurredAt
  )
    throw new ContentError("请选择有效的本地反馈事件、任务及时间。", 400);
  let email: string;
  try {
    email = customerEmail(v.email);
  } catch {
    throw new ContentError("请填写有效的虚构邮箱。", 400);
  }
  if (!email.endsWith("@example.invalid"))
    throw new ContentError("仅支持虚构邮箱的本地反馈。", 400);
  return { ...v, email };
}

/** Internal local simulation only. This is not a provider webhook or delivery authorization. */
export async function recordLocalCampaignFeedback(p: Payload, actor: Staff, value: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟回执。", 403);
  const input = inputFor(value);
  return recordFeedback(p, async (req) => ({
    input,
    actor: (await requireSubscriptionAdmin(p, actor, req)).id,
  }));
}
type StoredFeedback = Omit<Feedback, "kind"> & {
  kind: Feedback["kind"] | "provider-suppressed";
  address?: true;
  sourceHash?: string;
};
async function recordFeedback(
  p: Payload,
  prepare: (
    req: Partial<PayloadRequest>,
  ) => Promise<{ input: StoredFeedback; actor: number | null }>,
) {
  const saved = await contentTransaction(p, async (req) => {
    await executeSQL(p, req.transactionID, sql`SELECT pg_advisory_xact_lock(726281)`);
    const { input, actor } = await prepare(req);
    await executeSQL(
      p,
      req.transactionID,
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${subscriptionLockKey(input.email, "")},0))`,
    );
    const recipientHash = createHash("sha256").update(input.email).digest("hex");
    const existing = (
      await p.find({
        collection: "subscription-campaign-feedback",
        req,
        depth: 0,
        limit: 1,
        where: { eventId: { equals: input.eventId } },
      })
    ).docs[0];
    if (existing) {
      if (
        relationID(existing.attempt) !== (input.address ? undefined : input.attemptId) ||
        (existing.sourceHash ?? undefined) !== input.sourceHash ||
        existing.recipientHash !== recipientHash ||
        existing.kind !== input.kind ||
        new Date(existing.occurredAt).toISOString() !== input.occurredAt
      )
        throw new ContentError("该事件编号已有不同记录，请核实原反馈。", 409);
      return { auditId: null, replayed: true, input };
    }
    const attempt = await p.findByID({
      collection: "subscription-campaign-mock-attempts",
      id: input.attemptId,
      req,
      depth: 0,
      disableErrors: true,
    });
    if (!attempt) throw new ContentError("找不到已开始的本地模拟尝试。", 404);
    const slot = await p.findByID({
      collection: "subscription-campaign-mock-slots",
      id: relationID(attempt.slot)!,
      req,
      depth: 0,
    });
    const job = await p.findByID({
      collection: "subscription-campaign-jobs",
      id: relationID(slot.job)!,
      req,
      depth: 0,
    });
    const batch = await p.findByID({
      collection: "subscription-campaign-batches",
      id: relationID(slot.batch)!,
      req,
      depth: 0,
    });
    if (
      job.recipientHash !== recipientHash ||
      relationID(job.batch) !== batch.id ||
      job.campaignKey !== batch.campaignKey ||
      attempt.key !==
        createHash("sha256")
          .update(`mock-campaign-v1:${job.campaignKey}:${recipientHash}`)
          .digest("hex")
    )
      throw new ContentError("反馈与原活动收件任务不匹配。", 409);
    const times = attempt.attemptedAt;
    const { rows } = await executeSQL(
      p,
      req.transactionID,
      sql`SELECT floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms`,
    );
    if (
      !Array.isArray(times) ||
      !times.length ||
      times.length > 5 ||
      times.some((t) => typeof t !== "string" || !Number.isFinite(Date.parse(t)))
    )
      throw new ContentError("原模拟尝试记录不完整，请联系管理员核对。", 503);
    if (
      (!input.address &&
        Date.parse(input.occurredAt) < Math.min(...times.map((t) => Date.parse(String(t))))) ||
      Date.parse(input.occurredAt) > Number(rows[0].ms)
    )
      throw new ContentError("反馈时间必须在原尝试开始之后且不晚于当前时间。", 400);
    const event = await p.create({
      collection: "subscription-campaign-feedback",
      req,
      depth: 0,
      data: {
        eventId: input.eventId,
        attempt: input.address ? null : attempt.id,
        sourceHash: input.sourceHash,
        recipientHash,
        kind: input.kind,
        occurredAt: input.occurredAt,
      },
    });
    if (input.kind !== "delivered") {
      const blocked = (
        await p.find({
          collection: "subscription-marketing-suppressions",
          req,
          depth: 0,
          limit: 1,
          where: { recipientHash: { equals: recipientHash } },
        })
      ).docs[0];
      if (!blocked)
        await p.create({
          collection: "subscription-marketing-suppressions",
          req,
          depth: 0,
          data: { recipientHash, reason: input.kind, event: event.id },
        });
    }
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "subscription-campaign-feedback",
        recordId: String(event.id),
        actor,
        action: actor === null ? "feedback-webhook-local" : "feedback-local",
        fields: "kind,occurredAt",
        after: {
          ...(!input.address ? { attemptId: attempt.id } : {}),
          kind: input.kind,
          occurredAt: input.occurredAt,
        },
      },
    });
    return { auditId: audit.id, replayed: false, input };
  });
  if (
    saved.auditId !== null &&
    !(await p.findByID({
      collection: "audit-events",
      id: saved.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("反馈保存结果待核实，请使用原事件编号核对。", 503);
  return { eventId: saved.input.eventId, kind: saved.input.kind, replayed: saved.replayed };
}

/** Authentication is performed here, never supplied by an HTTP caller as a boolean or actor. */
export async function recordSignedCampaignFeedback(p: Payload, body: Buffer, headers: Headers) {
  if (process.env.APP_ENV !== "local" || process.env.SUBSCRIPTION_FEEDBACK_ENABLED !== "true")
    throw new ContentError("回执入口未开放。", 404);
  const secret = process.env.SUBSCRIPTION_FEEDBACK_SIGNING_SECRET;
  if (!secret) throw new ContentError("回执入口尚未配置。", 503);
  let id: string;
  try {
    id = verifyFeedbackSignature(body, headers, secret);
  } catch {
    throw new ContentError("回执认证失败。", 401);
  }
  let event: ReturnType<typeof parseFeedbackEvent>;
  try {
    event = parseFeedbackEvent(body);
  } catch {
    throw new ContentError("回执内容无效。", 400);
  }
  if (!event) return;
  const packet = event,
    eventId = "resend:" + createHash("sha256").update(id).digest("hex");
  const sourceHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
  return recordFeedback(p, async (req) => {
    const previous = (
      await p.find({
        collection: "subscription-campaign-feedback",
        req,
        depth: 0,
        limit: 1,
        where: { eventId: { equals: eventId } },
      })
    ).docs[0];
    if (previous && previous.sourceHash !== sourceHash)
      throw new ContentError("回执编号已有不同记录。", 409);
    const recipientHash = createHash("sha256").update(packet.email).digest("hex");
    const mail = (
      await p.find({
        collection: "subscription-campaign-mail-bindings",
        req,
        depth: 0,
        limit: 1,
        where: packet.emailId
          ? { emailId: { equals: packet.emailId } }
          : { recipientHash: { equals: recipientHash } },
      })
    ).docs[0];
    if (!mail) throw new ContentError("回执邮件绑定待核实，请重试。", 503);
    if (mail.recipientHash !== recipientHash) throw new ContentError("回执收件任务不匹配。", 409);
    return {
      actor: null,
      input: {
        eventId,
        attemptId: relationID(mail.attempt)!,
        email: packet.email,
        kind: packet.kind,
        occurredAt: packet.occurredAt,
        sourceHash,
        ...(packet.emailId === null ? { address: true as const } : {}),
      },
    };
  });
}
