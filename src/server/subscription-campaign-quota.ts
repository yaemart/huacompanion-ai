import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { relationID, type Staff } from "../cms/access";
import { businessTransaction } from "./business/service";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { requireSubscriptionAdmin } from "./subscription-management";
import { campaignAudience } from "./subscription-campaign-audience";
import { campaignTaskReason } from "./subscription-campaign-recheck";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";
import { requireCampaignRunning } from "./subscription-campaign-control";

const budgets = "subscription-campaign-mock-budgets";
const slots = "subscription-campaign-mock-slots";
type State =
  | "reserved-local"
  | "already-reserved"
  | "budget-unavailable"
  | "budget-exhausted"
  | "daily-limit"
  | "email-limit"
  | "no-candidate"
  | "ineligible";
type Report = { state: State; id?: number };
async function usage(p: Payload, req: Partial<PayloadRequest>) {
  const { rows } = await executeSQL(
    p,
    (await req.transactionID)!,
    sql`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE (reserved_at AT TIME ZONE 'Asia/Shanghai')::date=
        (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date)::int AS today,
      coalesce(array_agg(DISTINCT recipient_hash) FILTER (
        WHERE reserved_at > date_trunc('milliseconds', statement_timestamp()) - interval '24 hours'
      ), ARRAY[]::varchar[]) AS "recentHashes",
      floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms
    FROM subscription_campaign_mock_slots
  `,
  );
  return rows[0] as { total: number; today: number; recentHashes: string[]; ms: number };
}
async function committed(p: Payload, id: number | null) {
  if (
    id !== null &&
    !(await p.findByID({ collection: "audit-events", id, depth: 0, disableErrors: true }))
  )
    throw new ContentError("模拟额度操作未保存成功，请刷新后重试。", 503);
}

export async function setMockCampaignBudget(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地虚构余额。", 403);
  const result = await businessTransaction(p, async (req) => {
    const admin = await requireSubscriptionAdmin(p, actor, req);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !["remaining", "reason"].includes(key)) ||
      !("remaining" in input) ||
      typeof input.remaining !== "number" ||
      !Number.isSafeInteger(input.remaining) ||
      input.remaining < 0 ||
      input.remaining > 2000 ||
      !("reason" in input) ||
      typeof input.reason !== "string" ||
      !input.reason.trim() ||
      input.reason.length > 500
    )
      throw new ContentError("请填写0至2,000的模拟剩余份数及设置原因。", 400);
    const clock = await usage(p, req);
    const row = await p.create({
      collection: budgets,
      req,
      depth: 0,
      data: {
        remaining: input.remaining,
        baseUsage: clock.total,
        expiresAt: new Date(clock.ms + 3600000).toISOString(),
        actor: admin.id,
        reason: input.reason.trim(),
      },
    });
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: budgets,
        recordId: String(row.id),
        action: "set-mock-budget",
        actor: admin.id,
        fields: "remaining,baseUsage,expiresAt,reason",
        after: {
          remaining: row.remaining,
          baseUsage: row.baseUsage,
          expiresAt: row.expiresAt,
          reason: row.reason,
        },
      },
    });
    return { id: row.id, remaining: row.remaining, expiresAt: row.expiresAt, auditId: audit.id };
  });
  await committed(p, result.auditId);
  return { id: result.id, remaining: result.remaining, expiresAt: result.expiresAt };
}

export async function reserveMockCampaignSlot(
  p: Payload,
  actor: Staff,
  input: unknown,
): Promise<Report> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["campaignKey", "revision", "key"].includes(key)) ||
    !("campaignKey" in input) ||
    !("revision" in input) ||
    !("key" in input) ||
    typeof input.key !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.key)
  )
    throw new ContentError("请使用有效的本地占位操作编号。", 400);
  const key = input.key.toLowerCase();
  const result = await withConfirmedCampaign(
    p,
    actor,
    { campaignKey: input.campaignKey, revision: input.revision },
    async (req, draft) => {
      await requireCampaignRunning(p, req, draft.campaignKey);
      const stop = (state: State) => ({ auditId: null, report: { state } as Report });
      const batch = (
        await p.find({
          collection: "subscription-campaign-batches",
          req,
          depth: 0,
          limit: 1,
          where: { campaignKey: { equals: draft.campaignKey } },
        })
      ).docs[0];
      if (!batch || relationID(batch.draft) !== draft.id)
        throw new ContentError("请先冻结当前版本名单；改版续发尚未开放。", 409);
      const current = new Map((await campaignAudience(p, req)).map((row) => [row.id, row]));
      const preview = draft.preview as CampaignPreview;
      const eligible = (job: import("../../payload-types").SubscriptionCampaignJob) => {
        const live = current.get(relationID(job.subscription)!);
        return (
          job.status === "held" &&
          !campaignTaskReason(job, live, preview) &&
          !!live?.email.endsWith("@example.invalid")
        );
      };
      const previous = (
        await p.find({
          collection: slots,
          req,
          depth: 0,
          limit: 1,
          where: { key: { equals: key } },
        })
      ).docs[0];
      if (previous) {
        if (relationID(previous.batch) !== batch.id)
          throw new ContentError("该操作编号已用于其他活动。", 409);
        const job = await p.findByID({
          collection: "subscription-campaign-jobs",
          id: relationID(previous.job)!,
          req,
          depth: 0,
        });
        return eligible(job)
          ? { auditId: null, report: { state: "already-reserved", id: previous.id } as Report }
          : stop("ineligible");
      }
      const clock = await usage(p, req);
      const budget = (await p.find({ collection: budgets, req, depth: 0, limit: 1, sort: "-id" }))
        .docs[0];
      if (!budget || !(Date.parse(budget.expiresAt) > clock.ms) || clock.total < budget.baseUsage)
        return stop("budget-unavailable");
      if (clock.total - budget.baseUsage >= budget.remaining) return stop("budget-exhausted");
      if (clock.today >= 2000) return stop("daily-limit");
      const occupied = new Set(
        (
          await p.find({
            collection: slots,
            req,
            depth: 0,
            pagination: false,
            where: { batch: { equals: batch.id } },
          })
        ).docs.map((row) => relationID(row.job)),
      );
      const jobs = (
        await p.find({
          collection: "subscription-campaign-jobs",
          req,
          depth: 0,
          pagination: false,
          sort: "id",
          where: { batch: { equals: batch.id } },
        })
      ).docs;
      const recentRecipients = new Set(clock.recentHashes);
      let blocked: State = "no-candidate";
      for (const job of jobs) {
        if (occupied.has(job.id) || !eligible(job)) continue;
        if (recentRecipients.has(job.recipientHash)) {
          blocked = "email-limit";
          continue;
        }
        const row = await p.create({
          collection: slots,
          req,
          depth: 0,
          data: {
            key,
            job: job.id,
            batch: batch.id,
            budget: budget.id,
            recipientHash: job.recipientHash,
            reservedAt: new Date(clock.ms).toISOString(),
          },
        });
        const audit = await p.create({
          collection: "audit-events",
          req,
          data: {
            entity: slots,
            recordId: String(row.id),
            action: "reserve-mock-slot",
            actor: relationID(draft.owner),
            fields: "job,batch,budget,reservedAt",
            after: { batch: batch.id, budget: budget.id, reservedAt: row.reservedAt },
          },
        });
        return { auditId: audit.id, report: { state: "reserved-local", id: row.id } as Report };
      }
      return stop(blocked);
    },
  );
  await committed(p, result.auditId);
  return result.report;
}
