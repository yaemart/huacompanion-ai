import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignDraft } from "./subscription-campaign-drafts";
import { campaignControl, expireCampaignLeases } from "./subscription-campaign-control";

export async function cancelMockCampaign(p: Payload, actor: Staff, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["campaignKey", "revision", "reason"].includes(key)) ||
    !("campaignKey" in value) ||
    !("revision" in value) ||
    !("reason" in value) ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.length > 500
  )
    throw new ContentError("请选择当前活动并填写取消原因，最多500字符。", 400);
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟活动取消。", 403);
  const reason = value.reason.trim();
  const saved = await withCampaignDraft(
    p,
    actor,
    value.campaignKey,
    value.revision,
    async (req, draft) => {
      const previous = await campaignControl(p, req, draft.campaignKey);
      if (previous?.cancelledAt)
        return {
          auditId: null,
          report: {
            campaignKey: draft.campaignKey,
            cancelledAt: previous.cancelledAt,
            reason: previous.cancelReason!,
            cancelledJobs: 0,
            invalidatedLeases: 0,
          },
        };
      const { rows } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`SELECT date_trunc('milliseconds',statement_timestamp())::text AS at`,
      );
      const at = new Date(String(rows[0].at)).toISOString();
      const cancellation = { cancelledAt: at, cancelReason: reason };
      if (previous)
        await p.update({
          collection: "subscription-campaign-controls",
          id: previous.id,
          req,
          depth: 0,
          data: cancellation,
        });
      else
        await p.create({
          collection: "subscription-campaign-controls",
          req,
          depth: 0,
          data: {
            campaignKey: draft.campaignKey,
            owner: relationID(draft.owner)!,
            paused: false,
            reason,
            changedAt: at,
            ...cancellation,
          },
        });
      const cancelled = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
      UPDATE subscription_campaign_jobs j SET status='cancelled',cancel_reason='campaign-cancelled',
        cancelled_at=${at}::timestamptz,updated_at=${at}::timestamptz
      FROM subscription_campaign_batches b WHERE j.batch_id=b.id AND b.campaign_key=${draft.campaignKey}
        AND j.status='held' AND NOT EXISTS (
          SELECT 1 FROM subscription_campaign_mock_slots s JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
          WHERE s.job_id=j.id AND l.completed_at IS NOT NULL
        ) RETURNING j.id
    `,
      );
      const invalidatedLeases = await expireCampaignLeases(p, req, draft.campaignKey, at);
      const report = {
        campaignKey: draft.campaignKey,
        cancelledAt: at,
        reason,
        cancelledJobs: cancelled.rows.length,
        invalidatedLeases,
      };
      const audit = await p.create({
        collection: "audit-events",
        req,
        data: {
          entity: "subscription-campaign-controls",
          recordId: draft.campaignKey,
          actor: relationID(draft.owner),
          action: "cancel-local",
          fields: "cancelledAt,cancelReason,jobs.status,invalidatedLeases",
          after: report,
        },
      });
      return { auditId: audit.id, report };
    },
  );
  if (
    saved.auditId !== null &&
    !(await p.findByID({
      collection: "audit-events",
      id: saved.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("活动取消未保存成功，请刷新后核实。", 503);
  return saved.report;
}
