import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignRevision } from "./subscription-campaign-drafts";

export async function readCampaignFeedbackSummary(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地回执汇总。", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["campaignKey", "revision"].includes(key)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人当前活动查看回执汇总。", 400);
  return withCampaignRevision(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const query = async (statement: ReturnType<typeof sql>) =>
      (await executeSQL(p, (await req.transactionID)!, statement)).rows;
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
      total: 0,
      counts: { delivered: 0, hardBounce: 0, complaint: 0, providerSuppressed: 0, suppressed: 0 },
      asOf: new Date().toISOString(),
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
    const [row] = await query(sql`
      WITH roster AS (
        SELECT id,recipient_hash FROM subscription_campaign_jobs
        WHERE batch_id=${batch.id} AND campaign_key=${draft.campaignKey}
      ), mail AS (
        SELECT DISTINCT f.recipient_hash,f.kind FROM subscription_campaign_feedback f
        JOIN subscription_campaign_mock_attempts a ON a.id=f.attempt_id
        JOIN subscription_campaign_mock_slots s ON s.id=a.slot_id AND s.batch_id=${batch.id}
        JOIN roster j ON j.id=s.job_id AND j.recipient_hash=f.recipient_hash
      ) SELECT count(DISTINCT j.recipient_hash)::int AS total,
        count(DISTINCT m.recipient_hash) FILTER (WHERE m.kind='delivered')::int AS delivered,
        count(DISTINCT m.recipient_hash) FILTER (WHERE m.kind='hard-bounce')::int AS "hardBounce",
        count(DISTINCT m.recipient_hash) FILTER (WHERE m.kind='complaint')::int AS complaint,
        count(DISTINCT m.recipient_hash) FILTER (WHERE m.kind='provider-suppressed')::int AS "providerSuppressed",
        count(DISTINCT j.recipient_hash) FILTER (WHERE EXISTS (
          SELECT 1 FROM subscription_marketing_suppressions x WHERE x.recipient_hash=j.recipient_hash
        ))::int AS suppressed,
        to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf"
      FROM roster j LEFT JOIN mail m ON m.recipient_hash=j.recipient_hash
    `);
    result.total = Number(row.total);
    for (const key of Object.keys(result.counts) as (keyof typeof result.counts)[])
      result.counts[key] = Number(row[key]);
    result.asOf = String(row.asOf);
    return result;
  });
}
