import { executeSQL } from "./db-types";
import { subscriptionAttemptBudgetSQL } from "./subscription-attempt-budget";
import { createHash } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type {
  SubscriptionCampaignMockLease,
  SubscriptionCampaignJob,
  SubscriptionCampaignMockAttempt,
} from "../../payload-types";
import { ContentError } from "./content/error";
import type { CampaignPreview } from "./subscription-campaign-preview";

export type MockOutcome = "accepted" | "temporary" | "rate-limited" | "unknown" | "permanent";
export type AttemptReport = {
  state:
    | "attempting-local"
    | "retry-local"
    | "review-local"
    | "failed-local"
    | "completed-local"
    | "cooldown-local";
  id?: number;
  attempts: number;
  nextAttemptAt: string | null;
  started: boolean;
};
type Context = {
  email: string;
  slotId: number;
  job: SubscriptionCampaignJob;
  message: CampaignPreview["en"];
  lease?: SubscriptionCampaignMockLease;
  now: number;
  actorId: number;
};
type Input = { token?: string; outcome?: MockOutcome; retryAfterMs?: number };
const collection = "subscription-campaign-mock-attempts";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function mockAttemptState(
  p: Payload,
  req: Partial<PayloadRequest>,
  ctx: Context,
  action: "claim" | "complete" | "begin" | "result",
  input: Input,
): Promise<{ auditId: number | null; report: AttemptReport } | null> {
  let row = (
    await p.find({ collection, req, depth: 0, limit: 1, where: { slot: { equals: ctx.slotId } } })
  ).docs[0] as SubscriptionCampaignMockAttempt | undefined;
  const times = row?.attemptedAt;
  if (
    row &&
    (!Array.isArray(times) ||
      !times.length ||
      times.length > 5 ||
      times.some((t) => typeof t !== "string" || !Number.isFinite(Date.parse(t))))
  )
    throw new ContentError("模拟尝试记录不完整，请联系管理员核对。", 503);
  const attemptedAt = (times ?? []) as string[];
  const tokenHash = input.token ? hash(input.token.toLowerCase()) : "";
  const report = (started = false): AttemptReport => ({
    started,
    state: `${row!.state}-local`,
    id: ctx.lease?.id,
    attempts: (row!.attemptedAt as string[]).length,
    nextAttemptAt: row!.nextAttemptAt ?? null,
  });
  const sharedNext = async () => {
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      subscriptionAttemptBudgetSQL([ctx.email]),
    );
    return typeof rows[0]?.next === "string" ? Date.parse(rows[0].next) : 0;
  };
  const unchanged = () => ({ auditId: null, report: report() });
  const store = async (
    state: SubscriptionCampaignMockAttempt["state"],
    actionName: string,
    patch: Partial<
      Pick<
        SubscriptionCampaignMockAttempt,
        "attemptedAt" | "leaseTokenHash" | "lastOutcome" | "nextAttemptAt"
      >
    > = {},
  ) => {
    const data = { state, ...patch };
    row = row
      ? await p.update({ collection, id: row.id, req, depth: 0, data })
      : await p.create({
          collection,
          req,
          depth: 0,
          data: {
            slot: ctx.slotId,
            key: hash(`mock-campaign-v1:${ctx.job.campaignKey}:${ctx.job.recipientHash}`),
            message: { ...ctx.message!, locale: ctx.job.locale },
            attemptedAt: [],
            leaseTokenHash: tokenHash,
            ...data,
          },
        });
    const output = report(actionName === "begin-mock-attempt");
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        recordId: String(row.id),
        actor: ctx.actorId,
        action: actionName,
        fields: "state,attemptedAt,nextAttemptAt,lastOutcome",
        after: { ...output, slotId: ctx.slotId },
      },
    });
    return { auditId: audit.id, report: output };
  };
  if (action === "result" && (!row || row.leaseTokenHash !== tokenHash))
    throw new ContentError("本次模拟尝试凭证不匹配，请核实当前任务。", 409);
  if (row && ["review", "failed", "completed"].includes(row.state)) return unchanged();
  if (row) {
    const deadline = Date.parse(attemptedAt[0]) + 23 * 3600000;
    if (
      ctx.now >= deadline ||
      (row.state === "attempting" && Date.parse(ctx.lease!.expiresAt) <= ctx.now)
    )
      return store("review", "review-mock-attempt", { nextAttemptAt: null });
    if (action === "result" && row.lastOutcome) {
      if (row.lastOutcome !== input.outcome)
        throw new ContentError("本次模拟结果已经记录，不能覆盖。", 409);
      return unchanged();
    }
    if (action === "result") {
      if (row.state !== "attempting") throw new ContentError("请先开始一次有效模拟尝试。", 409);
      const next = Math.max(
        ctx.now + Math.max(input.retryAfterMs ?? 0, 30000 * 2 ** (attemptedAt.length - 1)),
        ["temporary", "rate-limited"].includes(input.outcome!) ? await sharedNext() : 0,
      );
      const state =
        input.outcome === "accepted"
          ? "completed"
          : input.outcome === "permanent"
            ? "failed"
            : input.outcome === "unknown" || attemptedAt.length >= 5 || next >= deadline
              ? "review"
              : "retry";
      await p.update({
        collection: "subscription-campaign-mock-leases",
        id: ctx.lease!.id,
        req,
        depth: 0,
        data:
          state === "completed"
            ? { completedAt: new Date(ctx.now).toISOString() }
            : { expiresAt: new Date(ctx.now).toISOString() },
      });
      return store(state, "outcome-mock-attempt", {
        lastOutcome: input.outcome,
        nextAttemptAt: state === "retry" ? new Date(next).toISOString() : null,
      });
    }
    if (row.state === "attempting") return unchanged();
    if (row.state === "retry") {
      if (!row.nextAttemptAt) throw new ContentError("模拟重试时间缺失，请联系管理员核对。", 503);
      if (attemptedAt.length >= 5)
        return store("review", "review-mock-attempt", { nextAttemptAt: null });
      if (Date.parse(row.nextAttemptAt) > ctx.now || action === "complete") return unchanged();
    }
  }
  if (action === "claim" || action === "begin") {
    if (
      action === "begin" &&
      (!ctx.lease || ctx.lease.completedAt || Date.parse(ctx.lease.expiresAt) <= ctx.now)
    )
      throw new ContentError("模拟租约已失效，请重新领取后开始尝试。", 409);
    const next = await sharedNext();
    if (next > ctx.now)
      return {
        auditId: null,
        report: {
          state: "cooldown-local",
          id: ctx.lease?.id,
          attempts: attemptedAt.length,
          nextAttemptAt: new Date(next).toISOString(),
          started: false,
        },
      };
  }
  if (action !== "begin") return null;
  if (!ctx.lease || ctx.lease.completedAt || Date.parse(ctx.lease.expiresAt) <= ctx.now)
    throw new ContentError("模拟租约已失效，请重新领取后开始尝试。", 409);
  if (!ctx.message) throw new ContentError("模拟正文缺失，请核对已保存版本。", 503);
  return store("attempting", "begin-mock-attempt", {
    attemptedAt: [...attemptedAt, new Date(ctx.now).toISOString()],
    leaseTokenHash: tokenHash,
    lastOutcome: null,
    nextAttemptAt: null,
  });
}
