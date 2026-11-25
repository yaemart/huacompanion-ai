import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import {
  parseContinuationReceipt,
  type ContinuationReceipt,
} from "../lib/subscription-campaign-continuation-client";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignRevision } from "./subscription-campaign-drafts";

export async function readCampaignContinuation(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地续发收据核实。", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["campaignKey", "revision"].includes(key)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人当前活动核实续发收据。", 400);
  return withCampaignRevision(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT a."after",o.revision AS original_revision,o.owner_id AS original_owner,o.campaign_key AS original_campaign
      FROM audit_events a JOIN subscription_campaign_batches b ON a.record_id=b.id::text
      JOIN subscription_campaign_drafts o ON o.id=b.draft_id
      WHERE a.entity='subscription-campaign-batches' AND a.action='continue-local'
        AND b.campaign_key=${draft.campaignKey} AND a.actor_id=${relationID(draft.owner)}
        AND a."after"->>'draftId'=${String(draft.id)} ORDER BY a.id DESC LIMIT 1
    `,
    );
    if (!rows.length) return null;
    const data = rows[0].after as Partial<ContinuationReceipt> | null;
    try {
      if (
        data?.originalRevision !== Number(rows[0].original_revision) ||
        Number(rows[0].original_owner) !== relationID(draft.owner) ||
        rows[0].original_campaign !== draft.campaignKey
      )
        throw Error("Frozen version does not match continuation receipt");
      return parseContinuationReceipt(
        {
          campaignKey: data?.campaignKey,
          revision: data?.revision,
          originalRevision: data?.originalRevision,
          bound: data?.bound,
          continuedAt: data?.continuedAt,
          replayed: true,
        },
        draft,
      );
    } catch {
      throw new ContentError("续发收据暂不可用，请联系管理员核对。", 503);
    }
  });
}
