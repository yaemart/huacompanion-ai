import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { campaignAudience } from "./subscription-campaign-audience";
import { campaignControl } from "./subscription-campaign-control";
import { campaignTaskReason } from "./subscription-campaign-recheck";
import { inspectCampaignMockChecks } from "./subscription-campaign-mock-checks";
import { preflightBlockers } from "../lib/subscription-campaign-revision-preflight";

export async function readCampaignRevisionPreflight(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地改版续发预检。", 403);
  return inspectCampaignMockChecks(p, actor, input, async (req, draft, saved, confirmed) => {
    const blockers: (keyof typeof preflightBlockers)[] = [];
    const counts = { attempted: 0, cancelled: 0, ineligible: 0, leased: 0, candidates: 0 };
    const control = await campaignControl(p, req, draft.campaignKey);
    if (!saved.current) blockers.push("source-changed");
    if (!confirmed) blockers.push("confirmation-required");
    if (control?.cancelledAt) blockers.push("cancelled");
    else if (control?.paused) blockers.push("paused");
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
    if (!batch) blockers.push("no-snapshot");
    else {
      const version = await p.findByID({
        collection: "subscription-campaign-drafts",
        req,
        depth: 0,
        id: relationID(batch.draft)!,
      });
      if (
        version.campaignKey !== draft.campaignKey ||
        relationID(version.owner) !== relationID(draft.owner) ||
        version.revision > draft.revision
      )
        throw new ContentError("快照版本暂不可用，请联系管理员核对。", 503);
      snapshot = { revision: version.revision, current: version.id === draft.id };
      if (snapshot.current) blockers.push("not-revised");
      const jobs = (
        await p.find({
          collection: "subscription-campaign-jobs",
          req,
          depth: 0,
          pagination: false,
          where: { batch: { equals: batch.id } },
        })
      ).docs;
      const audience = new Map((await campaignAudience(p, req)).map((row) => [row.id, row]));
      const { rows } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
        SELECT s.job_id AS job, a.id AS attempt, a.attempted_at AS times,
          l.completed_at IS NOT NULL AS completed,
          l.expires_at > statement_timestamp() AS leased
        FROM subscription_campaign_mock_slots s
        LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
        LEFT JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
        WHERE s.batch_id=${batch.id}
      `,
      );
      const evidence = new Map(rows.map((row) => [Number(row.job), row]));
      for (const job of jobs) {
        const row = evidence.get(job.id);
        if (
          row?.attempt &&
          (!Array.isArray(row.times) ||
            !row.times.length ||
            row.times.length > 5 ||
            row.times.some(
              (time: unknown) => typeof time !== "string" || !Number.isFinite(Date.parse(time)),
            ))
        )
          throw new ContentError("模拟尝试记录不完整，请联系管理员核对。", 503);
        const kind =
          row?.attempt || row?.completed
            ? "attempted"
            : job.status === "cancelled"
              ? "cancelled"
              : campaignTaskReason(job, audience.get(relationID(job.subscription)!), saved.preview)
                ? "ineligible"
                : row?.leased
                  ? "leased"
                  : "candidates";
        counts[kind]++;
      }
      if (rows.some((row) => row.leased && !row.completed)) blockers.push("active-lease");
    }
    return {
      revision: draft.revision,
      snapshot,
      counts,
      blockers,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      asOf: new Date().toISOString(),
    };
  });
}
