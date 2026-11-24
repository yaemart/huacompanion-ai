import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { customerEmail } from "../lib/customer";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { campaignAudience } from "./subscription-campaign-audience";
import { requireCampaignRunning } from "./subscription-campaign-control";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import { campaignTaskReason } from "./subscription-campaign-recheck";
import type { CampaignPreview } from "./subscription-campaign-preview";
import { subscriptionLockKey } from "./subscriptions";

type Receipt = {
  campaignKey: string;
  revision: number;
  originalRevision: number;
  bound: number;
  continuedAt: string;
  replayed: boolean;
};

export async function resumeMockCampaignRevision(p: Payload, actor: Staff, input: unknown) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟改版续发。", 403);
  const result = await withConfirmedCampaign(
    p,
    actor,
    input,
    async (req, draft, confirmation) => {
      await requireCampaignRunning(p, req, draft.campaignKey);
      const batch = (
        await p.find({
          collection: "subscription-campaign-batches",
          req,
          depth: 0,
          limit: 1,
          where: { campaignKey: { equals: draft.campaignKey } },
        })
      ).docs[0];
      if (!batch) throw new ContentError("请先保留原活动的冻结名单，再评估改版续发。", 409);
      const original = await p.findByID({
        collection: "subscription-campaign-drafts",
        req,
        depth: 0,
        id: relationID(batch.draft)!,
      });
      if (
        original.campaignKey !== draft.campaignKey ||
        relationID(original.owner) !== relationID(draft.owner)
      )
        throw new ContentError("原名单版本暂不可用，请联系管理员核对。", 503);
      if (original.revision >= draft.revision)
        throw new ContentError("请先保存同一活动的新版，并重新模拟测试及确认。", 409);
      const { rows: receipts } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
      SELECT id, "after" FROM audit_events WHERE entity='subscription-campaign-batches'
        AND record_id=${String(batch.id)} AND action='continue-local'
        AND "after"->>'draftId'=${String(draft.id)} ORDER BY id DESC LIMIT 1
    `,
      );
      if (receipts.length) {
        const data = receipts[0].after as Partial<Receipt> | null;
        if (
          !data ||
          data.campaignKey !== draft.campaignKey ||
          data.revision !== draft.revision ||
          data.originalRevision !== original.revision ||
          typeof data.bound !== "number" ||
          !Number.isSafeInteger(data.bound) ||
          data.bound < 1 ||
          data.bound > 1000 ||
          typeof data.continuedAt !== "string" ||
          !Number.isFinite(Date.parse(data.continuedAt)) ||
          new Date(data.continuedAt).toISOString() !== data.continuedAt
        )
          throw new ContentError("续发记录暂不可用，请联系管理员核对。", 503);
        return {
          auditId: Number(receipts[0].id),
          report: {
            campaignKey: draft.campaignKey,
            revision: draft.revision,
            originalRevision: original.revision,
            bound: data.bound,
            continuedAt: data.continuedAt,
            replayed: true,
          } satisfies Receipt,
        };
      }
      const jobs = (
        await p.find({
          collection: "subscription-campaign-jobs",
          req,
          depth: 0,
          pagination: false,
          sort: "id",
          where: { batch: { equals: batch.id } },
        })
      ).docs;
      if (jobs.length > 1000)
        throw new ContentError("原名单超过本地批次上限，请联系管理员核对。", 503);
      const { rows: contacts } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
      SELECT s.email,s.topic FROM subscriptions s JOIN subscription_campaign_jobs j ON j.subscription_id=s.id
      WHERE j.batch_id=${batch.id}
    `,
      );
      const global = new Set<string>(),
        topics = new Set<string>();
      for (const contact of contacts) {
        const email = String(contact.email),
          topic = String(contact.topic);
        topics.add(subscriptionLockKey(email, topic));
        try {
          const normalized = customerEmail(email);
          global.add(subscriptionLockKey(normalized, ""));
          topics.add(subscriptionLockKey(normalized, topic));
        } catch {
          /* Invalid contacts are excluded by the live audience below. */
        }
      }
      for (const keys of [global, topics])
        for (const key of [...keys].sort())
          await executeSQL(
            p,
            (await req.transactionID)!,
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`,
          );
      // A fresh read after subscriber locks, never the report's earlier eligibility snapshot.
      const live = new Map((await campaignAudience(p, req)).map((row) => [row.id, row]));
      const { rows: clock } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
      SELECT date_trunc('milliseconds',statement_timestamp())::text AS at, EXISTS (
        SELECT 1 FROM subscription_campaign_mock_slots s JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
        WHERE s.batch_id=${batch.id} AND l.completed_at IS NULL AND l.expires_at>statement_timestamp()
      ) AS busy
    `,
      );
      if (clock[0].busy)
        throw new ContentError("原名单仍有有效领取，请等待本轮结束后重新续发。", 409);
      const { rows: history } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
      SELECT s.job_id FROM subscription_campaign_mock_slots s
      JOIN subscription_campaign_jobs j ON j.id=s.job_id
      LEFT JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
      LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
      WHERE j.batch_id=${batch.id} AND (a.id IS NOT NULL OR l.completed_at IS NOT NULL)
    `,
      );
      const preserved = new Set(history.map((row) => Number(row.job_id)));
      const selected = jobs.filter((job) => {
        const person = live.get(relationID(job.subscription)!);
        return (
          job.campaignKey === draft.campaignKey &&
          job.status === "held" &&
          !preserved.has(job.id) &&
          !!person?.email.endsWith("@example.invalid") &&
          !campaignTaskReason(job, person, draft.preview as CampaignPreview)
        );
      });
      if (!selected.length)
        throw new ContentError("原名单没有从未尝试且仍符合资格的本地任务。", 409);
      const continuedAt = new Date(String(clock[0].at)).toISOString();
      for (const job of selected)
        await p.update({
          collection: "subscription-campaign-jobs",
          id: job.id,
          req,
          depth: 0,
          data: {
            continuationDraft: draft.id,
            continuationConfirmation: confirmation.id,
            continuedAt,
          },
        });
      const report: Receipt = {
        campaignKey: draft.campaignKey,
        revision: draft.revision,
        originalRevision: original.revision,
        bound: selected.length,
        continuedAt,
        replayed: false,
      };
      const audit = await p.create({
        collection: "audit-events",
        req,
        data: {
          entity: "subscription-campaign-batches",
          recordId: String(batch.id),
          action: "continue-local",
          actor: relationID(draft.owner),
          fields: "jobs.continuationDraft,continuationConfirmation,continuedAt",
          before: {
            jobs: selected.map((job) => ({
              id: job.id,
              draft: relationID(job.continuationDraft) ?? relationID(batch.draft),
              confirmation:
                relationID(job.continuationConfirmation) ?? relationID(batch.confirmation),
              at: job.continuedAt ?? batch.frozenAt,
            })),
          },
          after: {
            ...report,
            draftId: draft.id,
            confirmationId: confirmation.id,
            jobs: selected.map((job) => job.id),
          },
        },
      });
      return { auditId: audit.id, report };
    },
    { lockSettings: true },
  );
  if (
    !(await p.findByID({
      collection: "audit-events",
      id: result.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("续发绑定未保存成功，请刷新后核对。", 503);
  return result.report;
}
