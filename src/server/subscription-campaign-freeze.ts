import { createHash } from "node:crypto";
import type { Payload } from "payload";
import type { SubscriptionCampaignBatch } from "../../payload-types";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { campaignAudience } from "./subscription-campaign-audience";
import { withCampaignDraft } from "./subscription-campaign-drafts";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";
import { requireCampaignRunning } from "./subscription-campaign-control";

const collection = "subscription-campaign-batches";
function report(row: SubscriptionCampaignBatch) {
  const counts = row.counts;
  if (
    !counts ||
    typeof counts !== "object" ||
    Array.isArray(counts) ||
    typeof counts.zh !== "number" ||
    typeof counts.en !== "number" ||
    !Number.isSafeInteger(counts.zh) ||
    !Number.isSafeInteger(counts.en) ||
    counts.zh < 0 ||
    counts.en < 0
  )
    throw new ContentError("快照人数暂不可用，请联系管理员核对。", 503);
  return { id: row.id, frozenAt: row.frozenAt, counts: { zh: counts.zh, en: counts.en } };
}

export async function freezeCampaignRecipients(p: Payload, actor: Staff, input: unknown) {
  const result = await withConfirmedCampaign(p, actor, input, async (req, draft, confirmation) => {
    await requireCampaignRunning(p, req, draft.campaignKey);
    const existing = (
      await p.find({
        collection,
        req,
        depth: 0,
        limit: 1,
        where: { campaignKey: { equals: draft.campaignKey } },
      })
    ).docs[0];
    if (existing) {
      if (relationID(existing.draft) !== draft.id)
        throw new ContentError("该活动已有冻结名单，改版续发尚未开放，原快照已保留。", 409);
      return { row: existing, auditId: null };
    }
    const preview = draft.preview as CampaignPreview;
    const recipients: { id: number; email: string; locale: "zh" | "en"; version: number }[] = [];
    for (const row of await campaignAudience(p, req)) {
      const locale = row.locale;
      if ((locale === "zh" || locale === "en") && preview[locale])
        recipients.push({ ...row, locale });
      if (recipients.length > 1000) break;
    }
    if (recipients.length > 1000)
      throw new ContentError("当前合资格收件人超过每批 1,000 人上限，本批未冻结。", 400);
    if (!recipients.length)
      throw new ContentError("暂无符合当前同意、隐私版本及语言条件的收件人。", 400);
    const counts = { zh: 0, en: 0 };
    for (const recipient of recipients) counts[recipient.locale]++;
    const row = await p.create({
      collection,
      req,
      depth: 0,
      data: {
        campaignKey: draft.campaignKey,
        draft: draft.id,
        confirmation: confirmation.id,
        frozenAt: new Date().toISOString(),
        counts,
      },
    });
    for (const recipient of recipients) {
      await p.create({
        collection: "subscription-campaign-jobs",
        req,
        depth: 0,
        data: {
          campaignKey: draft.campaignKey,
          batch: row.id,
          subscription: recipient.id,
          consentVersion: Number(recipient.version),
          locale: recipient.locale,
          recipientHash: createHash("sha256").update(recipient.email).digest("hex"),
          status: "held",
        },
      });
    }
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        recordId: String(row.id),
        action: "freeze-local",
        actor: relationID(draft.owner),
        fields: "campaignKey,revision,counts,frozenAt",
        after: {
          campaignKey: draft.campaignKey,
          revision: draft.revision,
          counts,
          frozenAt: row.frozenAt,
        },
      },
    });
    return { row, auditId: audit.id };
  });
  if (
    result.auditId !== null &&
    !(await p.findByID({
      collection: "audit-events",
      id: result.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("收件快照未保存成功，请刷新后重试。", 503);
  return report(result.row);
}

export async function readCampaignFreeze(p: Payload, actor: Staff, input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !["campaignKey", "revision"].includes(field)) ||
    !("campaignKey" in input) ||
    !("revision" in input)
  )
    throw new ContentError("请从本人已保存的活动重新打开名单快照。", 400);
  return withCampaignDraft(p, actor, input.campaignKey, input.revision, async (req, draft) => {
    const batch = (
      await p.find({
        collection,
        req,
        depth: 0,
        limit: 1,
        where: { campaignKey: { equals: draft.campaignKey } },
      })
    ).docs[0];
    if (!batch) return null;
    const id = relationID(batch.draft);
    if (!id) throw new ContentError("快照版本暂不可用，请联系管理员核对。", 503);
    const version = await p.findByID({
      collection: "subscription-campaign-drafts",
      id,
      req,
      depth: 0,
    });
    if (
      version.campaignKey !== draft.campaignKey ||
      relationID(version.owner) !== relationID(draft.owner)
    )
      throw new ContentError("快照版本暂不可用，请联系管理员核对。", 503);
    return { ...report(batch), revision: version.revision, current: id === draft.id };
  });
}
