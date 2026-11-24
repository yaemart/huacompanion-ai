import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import {
  parseContinuationReceipt,
  type ContinuationReceipt,
} from "../lib/subscription-campaign-continuation-client";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { inspectCampaignMockChecks } from "./subscription-campaign-mock-checks";

export async function readCampaignContinuation(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地续发收据核实。", 403);
  return inspectCampaignMockChecks(p, actor, input, async (req, draft) => {
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT a."after" FROM audit_events a JOIN subscription_campaign_batches b ON a.record_id=b.id::text
      WHERE a.entity='subscription-campaign-batches' AND a.action='continue-local'
        AND b.campaign_key=${draft.campaignKey} AND a.actor_id=${relationID(draft.owner)}
        AND a."after"->>'draftId'=${String(draft.id)} ORDER BY a.id DESC LIMIT 1
    `,
    );
    if (!rows.length) return null;
    const data = rows[0].after as Partial<ContinuationReceipt> | null;
    try {
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
