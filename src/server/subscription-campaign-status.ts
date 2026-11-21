import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignDraft } from "./subscription-campaign-drafts";

type Task = {
  status: "held" | "cancelled";
  reserved: boolean;
  completed: boolean;
  expires: number | null;
  state: "attempting" | "retry" | "review" | "failed" | "completed" | null;
  attemptedAt: unknown;
  next: number | null;
};

export async function readCampaignTaskStatus(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟任务状态。", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !["campaignKey", "revision"].includes(field)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人当前活动查看模拟任务状态。", 400);
  return withCampaignDraft(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const counts = {
      unreserved: 0,
      ready: 0,
      leased: 0,
      attempting: 0,
      retryWaiting: 0,
      retryReady: 0,
      review: 0,
      failed: 0,
      completed: 0,
      cancelled: 0,
    };
    const { rows: clock } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`SELECT floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms`,
    );
    const now = Number(clock[0].ms);
    const batch = (
      await p.find({
        collection: "subscription-campaign-batches",
        req,
        depth: 0,
        limit: 1,
        where: { campaignKey: { equals: draft.campaignKey } },
      })
    ).docs[0];
    let snapshot: { revision: number; current: boolean } | null = null;
    const result = {
      counts,
      snapshot,
      total: 0,
      attempts: 0,
      nextAttemptAt: null as string | null,
      asOf: new Date(now).toISOString(),
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
    snapshot = { revision: version.revision, current: version.id === draft.id };
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
        SELECT j.status, s.id IS NOT NULL AS reserved, l.completed_at IS NOT NULL AS completed,
          extract(epoch FROM l.expires_at)::double precision*1000 AS expires,
          a.state, a.attempted_at AS "attemptedAt",
          extract(epoch FROM a.next_attempt_at)::double precision*1000 AS next
        FROM subscription_campaign_jobs j
        LEFT JOIN subscription_campaign_mock_slots s ON s.job_id=j.id AND s.batch_id=j.batch_id
        LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
        LEFT JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
        WHERE j.batch_id=${batch.id}
      `,
    );
    for (const task of rows as Task[]) {
      const times = task.attemptedAt;
      if (
        task.state &&
        (!Array.isArray(times) ||
          !times.length ||
          times.length > 5 ||
          times.some((t) => typeof t !== "string" || !Number.isFinite(Date.parse(t))))
      )
        throw new ContentError("模拟尝试记录不完整，请联系管理员核对。", 503);
      const attempted = (times ?? []) as string[];
      result.attempts += attempted.length;
      let state: keyof typeof counts;
      if (task.completed || task.state === "completed") state = "completed";
      else if (task.state === "failed" || task.state === "review") state = task.state;
      else if (
        task.state &&
        (now >= Date.parse(attempted[0]) + 23 * 3600000 ||
          (task.state === "attempting" && (task.expires === null || task.expires <= now)) ||
          (task.state === "retry" && attempted.length >= 5))
      )
        state = "review";
      else if (task.status === "cancelled") state = "cancelled";
      else if (task.state === "attempting") state = "attempting";
      else if (task.state === "retry") {
        if (task.next === null || !Number.isFinite(task.next))
          throw new ContentError("模拟重试时间缺失，请联系管理员核对。", 503);
        state = task.next > now ? "retryWaiting" : "retryReady";
        if (
          state === "retryWaiting" &&
          (!result.nextAttemptAt || task.next < Date.parse(result.nextAttemptAt))
        )
          result.nextAttemptAt = new Date(task.next).toISOString();
      } else
        state = !task.reserved
          ? "unreserved"
          : task.expires !== null && task.expires > now
            ? "leased"
            : "ready";
      counts[state]++;
    }
    return { ...result, snapshot, total: rows.length };
  });
}
