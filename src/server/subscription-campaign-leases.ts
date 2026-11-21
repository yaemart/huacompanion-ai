import {
  mockAttemptState,
  type AttemptReport,
  type MockOutcome,
} from "./subscription-campaign-attempt-state";
import { randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { customerEmail } from "../lib/customer";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { campaignAudience } from "./subscription-campaign-audience";
import { campaignTaskReason } from "./subscription-campaign-recheck";
import { withConfirmedCampaign } from "./subscription-campaign-mock-checks";
import type { CampaignPreview } from "./subscription-campaign-preview";
import { subscriptionLockKey } from "./subscriptions";
import { requireCampaignRunning } from "./subscription-campaign-control";

const collection = "subscription-campaign-mock-leases";
type Report =
  | AttemptReport
  | { state: "claimed-local"; id: number; token: string; expiresAt: string }
  | { state: "busy" | "completed-local" | "ineligible"; id?: number };
type Input = {
  campaignKey: unknown;
  revision: unknown;
  slotId: number;
  token?: string;
  outcome?: MockOutcome;
  retryAfterMs?: number;
};
export function beginMockCampaignAttempt(
  p: Payload,
  actor: Staff,
  input: unknown,
): Promise<Report> {
  return operate(p, actor, input, false, "begin");
}
export function recordMockCampaignOutcome(
  p: Payload,
  actor: Staff,
  input: unknown,
): Promise<Report> {
  return operate(p, actor, input, false, "result");
}

export function claimMockCampaignTask(p: Payload, actor: Staff, input: unknown): Promise<Report> {
  return operate(p, actor, input, false);
}

export function completeMockCampaignTask(
  p: Payload,
  actor: Staff,
  input: unknown,
): Promise<Report> {
  return operate(p, actor, input, true);
}

async function operate(
  p: Payload,
  actor: Staff,
  value: unknown,
  complete: boolean,
  attempt?: "begin" | "result",
): Promise<Report> {
  const requiresToken = complete || !!attempt;
  const fields = [
    "campaignKey",
    "revision",
    "slotId",
    ...(requiresToken ? ["token"] : []),
    ...(attempt === "result" ? ["outcome", "retryAfterMs"] : []),
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    !("campaignKey" in value) ||
    !("revision" in value) ||
    !("slotId" in value) ||
    typeof value.slotId !== "number" ||
    !Number.isSafeInteger(value.slotId) ||
    value.slotId <= 0 ||
    (requiresToken &&
      (!("token" in value) ||
        typeof value.token !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          value.token,
        )))
  )
    throw new ContentError("请从当前活动选择有效的模拟任务和租约凭证。", 400);
  if (
    attempt === "result" &&
    (!("outcome" in value) ||
      typeof value.outcome !== "string" ||
      !["accepted", "temporary", "rate-limited", "unknown", "permanent"].includes(value.outcome) ||
      ("retryAfterMs" in value &&
        (value.outcome !== "rate-limited" ||
          typeof value.retryAfterMs !== "number" ||
          !Number.isSafeInteger(value.retryAfterMs) ||
          value.retryAfterMs < 0)))
  )
    throw new ContentError("请选择有效的本地模拟结果和等待时间。", 400);
  const input = value as Input;
  const result = await withConfirmedCampaign(
    p,
    actor,
    { campaignKey: input.campaignKey, revision: input.revision },
    async (req, draft) => {
      await requireCampaignRunning(p, req, draft.campaignKey);
      const stop = (state: "busy" | "completed-local" | "ineligible", id?: number) => ({
        auditId: null,
        report: { state, ...(id === undefined ? {} : { id }) } as Report,
      });
      const slot = await p.findByID({
        collection: "subscription-campaign-mock-slots",
        id: input.slotId,
        req,
        depth: 0,
        disableErrors: true,
      });
      if (!slot) throw new ContentError("该模拟任务不在当前活动中。", 404);
      const batch = await p.findByID({
        collection: "subscription-campaign-batches",
        id: relationID(slot.batch)!,
        req,
        depth: 0,
      });
      if (relationID(batch.draft) !== draft.id)
        throw new ContentError("该模拟任务不在当前活动中。", 404);
      const job = await p.findByID({
        collection: "subscription-campaign-jobs",
        id: relationID(slot.job)!,
        req,
        depth: 0,
      });
      const subscription = await p.findByID({
        collection: "subscriptions",
        id: relationID(job.subscription)!,
        req,
        depth: 0,
      });
      let normalized: string;
      try {
        normalized = customerEmail(subscription.email);
      } catch {
        return stop("ineligible");
      }
      // Serialize with public confirmation/withdrawal, including legacy non-normalized addresses.
      const keys = [
        ...new Set([
          subscriptionLockKey(subscription.email, subscription.topic),
          subscriptionLockKey(normalized, subscription.topic),
        ]),
      ].sort();
      for (const key of keys)
        await executeSQL(
          p,
          (await req.transactionID)!,
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`,
        );
      const live = (await campaignAudience(p, req)).find(
        (row) => row.id === relationID(job.subscription),
      );
      if (
        job.status !== "held" ||
        campaignTaskReason(job, live, draft.preview as CampaignPreview) ||
        !live?.email.endsWith("@example.invalid")
      )
        return stop("ineligible");
      const { rows } = await executeSQL(
        p,
        (await req.transactionID)!,
        sql`SELECT floor(extract(epoch FROM statement_timestamp())*1000)::double precision AS ms`,
      );
      const now = Number(rows[0].ms);
      const previous = (
        await p.find({ collection, req, depth: 0, limit: 1, where: { slot: { equals: slot.id } } })
      ).docs[0];
      if (requiresToken && (!previous || previous.token !== input.token!.toLowerCase()))
        throw new ContentError("租约凭证已失效，请重新抢占模拟任务。", 409);
      const attemptResult = await mockAttemptState(
        p,
        req,
        {
          actorId: relationID(draft.owner)!,
          slotId: slot.id,
          job,
          message: (draft.preview as CampaignPreview)[job.locale],
          lease: previous,
          now,
        },
        attempt ?? (complete ? "complete" : "claim"),
        input,
      );
      if (attemptResult) return attemptResult;
      if (complete) {
        if (previous.completedAt) return stop("completed-local", previous.id);
        if (!(Date.parse(previous.expiresAt) > now))
          throw new ContentError("模拟租约已到期，请重新抢占后处理。", 409);
      } else if (previous) {
        if (previous.completedAt) return stop("completed-local", previous.id);
        if (Date.parse(previous.expiresAt) > now) return stop("busy");
      }
      const data = complete
        ? { completedAt: new Date(now).toISOString() }
        : {
            slot: slot.id,
            token: randomUUID(),
            expiresAt: new Date(now + 60000).toISOString(),
            completedAt: null,
          };
      const row = previous
        ? await p.update({ collection, id: previous.id, req, depth: 0, data })
        : await p.create({
            collection,
            req,
            depth: 0,
            data: { ...data, slot: slot.id, token: data.token!, expiresAt: data.expiresAt! },
          });
      const audit = await p.create({
        collection: "audit-events",
        req,
        data: {
          entity: collection,
          recordId: String(row.id),
          actor: relationID(draft.owner),
          action: complete
            ? "complete-mock-task"
            : previous
              ? "recover-mock-task"
              : "claim-mock-task",
          fields: complete ? "completedAt" : "expiresAt",
          after: {
            slotId: slot.id,
            expiresAt: row.expiresAt,
            completedAt: row.completedAt ?? null,
          },
        },
      });
      const report: Report = complete
        ? { state: "completed-local", id: row.id }
        : { state: "claimed-local", id: row.id, token: row.token, expiresAt: row.expiresAt };
      return { auditId: audit.id, report };
    },
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
    throw new ContentError("模拟租约操作未保存成功，请刷新后重试。", 503);
  return result.report;
}
