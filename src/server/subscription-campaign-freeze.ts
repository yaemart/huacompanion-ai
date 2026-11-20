import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import type { SubscriptionCampaignBatch } from "../../payload-types";
import { relationID, type Staff } from "../cms/access";
import { customerEmail } from "../lib/customer";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";

const collection = "subscription-campaign-batches";
function report(row: SubscriptionCampaignBatch) {
  return { id: row.id, frozenAt: row.frozenAt, counts: row.counts };
}

export async function freezeCampaignRecipients(p: Payload, actor: Staff, input: unknown) {
  const result = await withConfirmedCampaign(p, actor, input, async (req, draft, confirmation) => {
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
    const languages = (["zh", "en"] as const).filter((locale) => preview[locale]);
    const privacy = process.env.PRIVACY_VERSION?.trim() || "";
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT id, email, locale, consent_version AS version, status, confirmed_at, privacy_version
      FROM subscriptions WHERE topic='policy-updates' ORDER BY consented_at DESC, id DESC
    `,
    );
    const seen = new Set<string>();
    const recipients: { id: number; email: string; locale: "zh" | "en"; version: number }[] = [];
    for (const row of rows as {
      id: number;
      email: string;
      locale: string;
      version: string;
      status: string;
      confirmed_at: string | null;
      privacy_version: string;
    }[]) {
      let email: string;
      try {
        email = customerEmail(row.email);
      } catch {
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      const version = Number(row.version);
      if (
        row.status !== "confirmed" ||
        !row.confirmed_at ||
        !Number.isSafeInteger(version) ||
        version < 1 ||
        !privacy ||
        row.privacy_version !== privacy ||
        (row.locale !== "zh" && row.locale !== "en") ||
        !languages.includes(row.locale)
      )
        continue;
      recipients.push({ id: row.id, email, locale: row.locale, version });
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
