import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import type { SubscriptionCampaignControl, SubscriptionCampaignDraft } from "../../payload-types";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { withCampaignDraft } from "./subscription-campaign-drafts";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";

const collection = "subscription-campaign-controls";
type Scope = Partial<PayloadRequest>;
type Input = { campaignKey: unknown; revision: unknown; paused?: boolean; reason?: string };
function inputFor(value: unknown, change = false): Input {
  const fields = ["campaignKey", "revision", ...(change ? ["paused", "reason"] : [])];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    !("campaignKey" in value) ||
    !("revision" in value) ||
    (change &&
      (!("paused" in value) ||
        typeof value.paused !== "boolean" ||
        !("reason" in value) ||
        typeof value.reason !== "string" ||
        !value.reason.trim() ||
        value.reason.length > 500))
  )
    throw new ContentError("请选择当前活动，并填写暂停或恢复的原因。", 400);
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地模拟活动控制。", 403);
  return value as Input;
}
async function control(p: Payload, req: Scope, campaignKey: string) {
  return (
    await p.find({
      collection,
      req,
      depth: 0,
      limit: 1,
      where: { campaignKey: { equals: campaignKey } },
    })
  ).docs[0];
}
function report(campaignKey: string, row?: SubscriptionCampaignControl, invalidatedLeases = 0) {
  return {
    campaignKey,
    paused: row?.paused ?? false,
    changedAt: row?.changedAt ?? null,
    reason: row?.reason ?? null,
    invalidatedLeases,
  };
}

export async function requireCampaignRunning(p: Payload, req: Scope, campaignKey: string) {
  if (!req.transactionID) throw new ContentError("模拟活动控制需要数据库事务。", 503);
  if ((await control(p, req, campaignKey))?.paused)
    throw new ContentError("本活动已暂停，请确认当前模拟测试后由负责人恢复。", 409);
}

export async function readCampaignPause(p: Payload, actor: Staff, value: unknown) {
  const input = inputFor(value);
  return withCampaignDraft(p, actor, input.campaignKey, input.revision, async (req, draft) =>
    report(draft.campaignKey, await control(p, req, draft.campaignKey)),
  );
}

export async function setCampaignPause(p: Payload, actor: Staff, value: unknown) {
  const input = inputFor(value, true);
  const work = async (req: Scope, draft: SubscriptionCampaignDraft) => {
    const previous = await control(p, req, draft.campaignKey);
    if ((previous?.paused ?? false) === input.paused)
      return { auditId: null, report: report(draft.campaignKey, previous) };
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`SELECT date_trunc('milliseconds',statement_timestamp())::text AS at`,
    );
    const changedAt = new Date(String(rows[0].at)).toISOString();
    const data = {
      campaignKey: draft.campaignKey,
      owner: relationID(draft.owner)!,
      paused: input.paused!,
      reason: input.reason!.trim(),
      changedAt,
    };
    const row = previous
      ? await p.update({ collection, id: previous.id, req, depth: 0, data })
      : await p.create({ collection, req, depth: 0, data });
    let invalidatedLeases = 0;
    if (input.paused) {
      const expired = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`
        UPDATE subscription_campaign_mock_leases l SET expires_at=${changedAt}::timestamptz, updated_at=${changedAt}::timestamptz
        FROM subscription_campaign_mock_slots s JOIN subscription_campaign_batches b ON b.id=s.batch_id
        WHERE l.slot_id=s.id AND b.campaign_key=${draft.campaignKey}
          AND l.completed_at IS NULL AND l.expires_at>${changedAt}::timestamptz RETURNING l.id
      `,
      );
      invalidatedLeases = expired.rows.length;
    }
    const output = report(draft.campaignKey, row, invalidatedLeases);
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        recordId: draft.campaignKey,
        actor: relationID(draft.owner),
        action: input.paused ? "pause-local" : "resume-local",
        fields: "paused,changedAt,reason,invalidatedLeases",
        after: output,
      },
    });
    return { auditId: audit.id, report: output };
  };
  const result = input.paused
    ? await withCampaignDraft(p, actor, input.campaignKey, input.revision, work)
    : await withConfirmedCampaign(
        p,
        actor,
        { campaignKey: input.campaignKey, revision: input.revision },
        work,
      );
  if (
    result.auditId !== null &&
    !(await p.findByID({
      collection: "audit-events",
      id: result.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("活动暂停或恢复未保存成功，请刷新后重试。", 503);
  return result.report;
}
