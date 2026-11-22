import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import type { Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignDraft } from "./subscription-campaign-drafts";

export async function readCampaignMockSlots(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟任务演练。", 403);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["campaignKey", "revision"].includes(key)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人当前活动读取已占位任务。", 400);
  return withCampaignDraft(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT s.id FROM subscription_campaign_mock_slots s
      JOIN subscription_campaign_batches b ON b.id=s.batch_id
      WHERE b.draft_id=${draft.id} ORDER BY s.id
    `,
    );
    return rows.map((row) => Number(row.id));
  });
}
