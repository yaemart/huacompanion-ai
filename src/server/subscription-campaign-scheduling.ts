import { readDispatchWait } from "./local-mail-dispatch";
import { hasSubscriptionPriority } from "./subscription-mail-priority";
import { subscriptionAttemptBudgetSQL } from "./subscription-attempt-budget";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { campaignAudience } from "./subscription-campaign-audience";
import { requireCampaignRunning } from "./subscription-campaign-control";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";
import { campaignTaskReason } from "./subscription-campaign-recheck";
import { campaignBatchMatches, campaignJobDraft } from "./subscription-campaign-job-version";

type Candidate = {
  id: number;
  job: number;
  completed: boolean;
  expires: number | null;
  state: string | null;
  times: unknown;
  next: number | null;
};
export async function readNextCampaignMockSlot(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟自动领取。", 403);
  return withConfirmedCampaign(p, actor, input, async (req, draft) => {
    await requireCampaignRunning(p, req, draft.campaignKey);
    const batch = (
      await p.find({
        collection: "subscription-campaign-batches",
        req,
        depth: 0,
        limit: 1,
        where: { campaignKey: { equals: draft.campaignKey } },
      })
    ).docs[0];
    if (!batch || !(await campaignBatchMatches(p, req, batch, draft)))
      throw new ContentError("请先冻结本人当前版名单，或为本版保存原名单的本地续发范围。", 409);
    const { rows: clock } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`SELECT floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms`,
    );
    const now = Number(clock[0].ms);
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT s.id, s.job_id AS job, l.completed_at IS NOT NULL AS completed,
        extract(epoch FROM l.expires_at)::double precision*1000 AS expires,
        a.state, a.attempted_at AS times,
        extract(epoch FROM a.next_attempt_at)::double precision*1000 AS next
      FROM subscription_campaign_mock_slots s
      JOIN subscription_campaign_jobs j ON j.id=s.job_id AND j.batch_id=s.batch_id
      LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
      LEFT JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
      WHERE s.batch_id=${batch.id} AND COALESCE(j.continuation_draft_id,${relationID(batch.draft)})=${draft.id}
      ORDER BY s.id
    `,
    );
    const jobs = new Map(
      (
        await p.find({
          collection: "subscription-campaign-jobs",
          req,
          depth: 0,
          pagination: false,
          where: { batch: { equals: batch.id } },
        })
      ).docs.map((j) => [j.id, j]),
    );
    const audience = new Map((await campaignAudience(p, req)).map((row) => [row.id, row]));
    const { rows: shared } = await executeSQL(
      p,
      (await req.transactionID)!,
      subscriptionAttemptBudgetSQL(
        [...jobs.values()]
          .map((job) => audience.get(relationID(job.subscription)!)?.email)
          .filter((email): email is string => !!email),
      ),
    );
    const waits = new Map(shared.map((row) => [String(row.email), Date.parse(String(row.next))]));
    const dispatch = await readDispatchWait(
      async (statement) => (await executeSQL(p, (await req.transactionID)!, statement)).rows,
      () => hasSubscriptionPriority(p, req),
    );
    let slotId: number | null = null;
    let nextAt: number | null = null;
    for (const row of rows as Candidate[]) {
      const times = row.times;
      if (
        row.state &&
        (!Array.isArray(times) ||
          !times.length ||
          times.length > 5 ||
          times.some((t) => typeof t !== "string" || !Number.isFinite(Date.parse(t))))
      )
        throw new ContentError("模拟尝试记录不完整，请联系管理员核对。", 503);
      const attempts = (times ?? []) as string[];
      if (
        row.completed ||
        ["completed", "failed", "review", "attempting"].includes(row.state ?? "")
      )
        continue;
      if (row.state && (attempts.length >= 5 || now >= Date.parse(attempts[0]) + 23 * 3600000))
        continue;
      const job = jobs.get(row.job);
      const live = job && audience.get(relationID(job.subscription)!);
      if (
        !job ||
        campaignJobDraft(job, batch) !== draft.id ||
        job.status !== "held" ||
        !live?.email.endsWith("@example.invalid") ||
        campaignTaskReason(job, live, draft.preview as CampaignPreview)
      )
        continue;
      if (row.state === "retry" && (row.next === null || !Number.isFinite(row.next)))
        throw new ContentError("模拟重试时间缺失，请联系管理员核对。", 503);
      const readyAt = Math.max(
        row.expires ?? 0,
        row.state === "retry" ? row.next! : 0,
        waits.get(live.email) ?? 0,
        dispatch ? Date.parse(dispatch.nextAttemptAt) : 0,
      );
      if (readyAt > now) nextAt = nextAt === null ? readyAt : Math.min(nextAt, readyAt);
      else if (slotId === null) slotId = row.id;
    }
    return {
      slotId,
      nextAttemptAt: nextAt === null ? null : new Date(nextAt).toISOString(),
      asOf: new Date(now).toISOString(),
    };
  });
}
