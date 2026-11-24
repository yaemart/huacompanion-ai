import { createHash } from "node:crypto";
import type { SubscriptionCampaignJob } from "../../payload-types";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { campaignControl } from "./subscription-campaign-control";
import { campaignAudience } from "./subscription-campaign-audience";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";

const reasonKeys = {
  ineligible: "ineligible",
  "campaign-cancelled": "campaignCancelled",
  "consent-changed": "consentChanged",
  "contact-changed": "contactChanged",
} as const;

export function campaignTaskReason(
  job: SubscriptionCampaignJob,
  live: Awaited<ReturnType<typeof campaignAudience>>[number] | undefined,
  preview: CampaignPreview,
): keyof typeof reasonKeys | null {
  return !live
    ? "ineligible"
    : live.version !== job.consentVersion
      ? "consent-changed"
      : live.locale !== job.locale ||
          !preview[job.locale] ||
          createHash("sha256").update(live.email).digest("hex") !== job.recipientHash
        ? "contact-changed"
        : null;
}

export async function recheckCampaignRecipients(p: Payload, actor: Staff, input: unknown) {
  const saved = await withConfirmedCampaign(p, actor, input, async (req, draft) => {
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
      throw new ContentError("整批资格复核仅支持原冻结版；改版请使用本地续发入口。", 409);
    const jobs = (
      await p.find({
        collection: "subscription-campaign-jobs",
        req,
        depth: 0,
        pagination: false,
        where: { batch: { equals: batch.id } },
      })
    ).docs;
    const current = new Map((await campaignAudience(p, req)).map((row) => [row.id, row]));
    const preview = draft.preview as CampaignPreview;
    const changes: { id: number; reason: keyof typeof reasonKeys }[] = [];
    const stopped = !!(await campaignControl(p, req, draft.campaignKey))?.cancelledAt;
    for (const job of jobs) {
      if (stopped || job.status === "cancelled") continue;
      const live = current.get(relationID(job.subscription)!);
      const reason = campaignTaskReason(job, live, preview);
      if (!reason) continue;
      const cancelledAt = new Date().toISOString();
      await p.update({
        collection: "subscription-campaign-jobs",
        id: job.id,
        req,
        depth: 0,
        data: { status: "cancelled", cancelReason: reason, cancelledAt },
      });
      job.status = "cancelled";
      job.cancelReason = reason;
      job.cancelledAt = cancelledAt;
      changes.push({ id: job.id, reason });
    }
    const held = { zh: 0, en: 0 };
    const cancelled = { ineligible: 0, consentChanged: 0, contactChanged: 0, campaignCancelled: 0 };
    for (const job of jobs) {
      if (job.status === "held") held[job.locale]++;
      else {
        if (!job.cancelReason || !job.cancelledAt)
          throw new ContentError("取消记录不完整，请联系管理员核对。", 503);
        cancelled[reasonKeys[job.cancelReason]]++;
      }
    }
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "subscription-campaign-batches",
        recordId: String(batch.id),
        action: "recheck-local",
        actor: relationID(draft.owner),
        fields: "jobs.status,cancelReason,cancelledAt",
        after: { held, cancelled, changes },
      },
    });
    return {
      auditId: audit.id,
      report: {
        batch: batch.id,
        checkedAt: audit.createdAt,
        held,
        cancelled,
        newlyCancelled: changes.length,
      },
    };
  });
  if (
    !(await p.findByID({
      collection: "audit-events",
      id: saved.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("任务复核未保存成功，请刷新后重试。", 503);
  return saved.report;
}
