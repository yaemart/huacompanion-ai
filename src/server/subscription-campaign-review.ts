import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { campaignReviewReason, type ReviewAttempt } from "../lib/subscription-campaign-review";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignDraft } from "./subscription-campaign-drafts";

type Task = ReviewAttempt & { slotId: number; attemptId: number; leaseId: number | null };
type ReviewRow = Pick<Task, "slotId" | "attemptedAt" | "lastOutcome"> & {
  reason: NonNullable<ReturnType<typeof campaignReviewReason>>;
  events: { action: string; at: string }[];
  hasOlderEvents: boolean;
};
export async function readCampaignReviewDetails(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟待核对明细。", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["campaignKey", "revision", "page"].includes(key)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人活动查看待核对明细。", 400);
  const page = "page" in input ? input.page : 1;
  if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 || page > 40)
    throw new ContentError("明细页码无效，请重新打开活动。", 400);
  return withCampaignDraft(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const query = async (statement: ReturnType<typeof sql>) =>
      (await executeSQL(p, (await req.transactionID)!, statement)).rows;
    const now = Number(
      (
        await query(
          sql`SELECT extract(epoch FROM statement_timestamp())::double precision*1000 AS ms`,
        )
      )[0].ms,
    );
    const batch = (
      await p.find({
        collection: "subscription-campaign-batches",
        req,
        depth: 0,
        limit: 1,
        where: { campaignKey: { equals: draft.campaignKey } },
      })
    ).docs[0];
    const result = {
      snapshot: null as { revision: number; current: boolean } | null,
      asOf: new Date(now).toISOString(),
      page,
      total: 0,
      rows: [] as ReviewRow[],
    };
    if (!batch) return result;
    const version = await p.findByID({
      collection: "subscription-campaign-drafts",
      id: relationID(batch.draft)!,
      req,
      depth: 0,
    });
    if (
      version.campaignKey !== draft.campaignKey ||
      relationID(version.owner) !== relationID(draft.owner)
    )
      throw new ContentError("快照版本暂不可用，请联系管理员核对。", 503);
    result.snapshot = { revision: version.revision, current: version.id === draft.id };
    const tasks = await query(sql`
      SELECT s.id AS "slotId", a.id AS "attemptId", l.id AS "leaseId", a.state,
        a.attempted_at AS "attemptedAt", a.last_outcome AS "lastOutcome",
        l.completed_at IS NOT NULL AS completed,
        extract(epoch FROM l.expires_at)::double precision*1000 AS expires
      FROM subscription_campaign_jobs j
      JOIN subscription_campaign_mock_slots s ON s.job_id=j.id AND s.batch_id=j.batch_id
      JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
      LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
      WHERE j.batch_id=${batch.id} ORDER BY s.id
    `);
    const reviews = tasks.flatMap<Task & { reason: ReviewRow["reason"] }>((raw) => {
      const task = raw as Task;
      if (
        !["attempting", "retry", "review", "failed", "completed"].includes(task.state) ||
        (task.lastOutcome !== null &&
          !["accepted", "temporary", "rate-limited", "unknown", "permanent"].includes(
            task.lastOutcome,
          )) ||
        !Array.isArray(task.attemptedAt) ||
        !task.attemptedAt.length ||
        task.attemptedAt.length > 5 ||
        task.attemptedAt.some((at) => typeof at !== "string" || !Number.isFinite(Date.parse(at)))
      )
        throw new ContentError("模拟尝试记录不完整，请联系管理员核对。", 503);
      const reason = campaignReviewReason(task, now);
      return reason ? [{ ...task, reason }] : [];
    });
    result.total = reviews.length;
    for (const task of reviews.slice((page - 1) * 25, page * 25)) {
      const events = await query(sql`
        SELECT action, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM audit_events
        WHERE "after"->>'slotId'=${String(task.slotId)} AND (
          (entity='subscription-campaign-mock-leases' AND record_id=${String(task.leaseId)}
            AND action IN ('claim-mock-task','recover-mock-task')) OR
          (entity='subscription-campaign-mock-attempts' AND record_id=${String(task.attemptId)}
            AND action IN ('begin-mock-attempt','outcome-mock-attempt','review-mock-attempt'))
        ) ORDER BY id DESC LIMIT 21
      `);
      result.rows.push({
        slotId: task.slotId,
        attemptedAt: task.attemptedAt,
        lastOutcome: task.lastOutcome,
        reason: task.reason,
        hasOlderEvents: events.length > 20,
        events: events
          .slice(0, 20)
          .reverse()
          .map((event) => ({
            action: String(event.action),
            at: String(event.at),
          })),
      });
    }
    return result;
  });
}
