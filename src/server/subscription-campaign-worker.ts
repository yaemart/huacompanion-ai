import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { mockWorkerOptions, requireLocalMockWorker } from "../lib/subscription-mock-worker-options";
import { ContentError } from "./content/error";
import { readNextCampaignMockSlot } from "./subscription-campaign-scheduling";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
} from "./subscription-campaign-leases";

type TaskReport = Awaited<ReturnType<typeof claimMockCampaignTask>>;
export type WorkerReport = {
  state: TaskReport["state"] | "idle-local";
  slotId?: number;
  attempts?: number;
  nextAttemptAt?: string | null;
};
type Pending = {
  input: { campaignKey: string; revision: number; slotId: number; token: string };
};
const safeReport = (report: TaskReport, slotId: number): WorkerReport => ({
  state: report.state,
  slotId,
  ...("attempts" in report ? { attempts: report.attempts } : {}),
  ...("nextAttemptAt" in report ? { nextAttemptAt: report.nextAttemptAt } : {}),
});

export function createMockCampaignWorker(p: Payload, value: unknown) {
  requireLocalMockWorker();
  const options = mockWorkerOptions(value);
  const input = { campaignKey: options.campaignKey, revision: options.revision };
  let pending: Pending | null = null;
  let failed = false;
  return async (): Promise<WorkerReport> => {
    requireLocalMockWorker();
    if (failed) throw new ContentError("本地模拟worker已停止，请核对后重新启动。", 409);
    try {
      const actor = await p.findByID({
        collection: "staff",
        id: options.staffId,
        depth: 0,
        disableErrors: true,
      });
      if (!actor) throw new ContentError("请指定当前已授权的主管。", 403);
      if (pending) {
        const { rows } = await p.db.drizzle.execute(
          sql`
          SELECT expires_at>clock_timestamp() AND completed_at IS NULL AS active
          FROM subscription_campaign_mock_leases
          WHERE slot_id=${pending.input.slotId} AND token=${pending.input.token}
        ` as never,
        );
        if (!rows[0]?.active) pending = null;
      }
      if (!pending) {
        const next = await readNextCampaignMockSlot(p, actor, input);
        if (next.slotId === null) return { state: "idle-local", nextAttemptAt: next.nextAttemptAt };
        const claimed = await claimMockCampaignTask(p, actor, { ...input, slotId: next.slotId });
        if (claimed.state !== "claimed-local") return safeReport(claimed, next.slotId);
        pending = {
          input: { ...input, slotId: next.slotId, token: claimed.token },
        };
      }
      const current = pending;
      const started = await beginMockCampaignAttempt(p, actor, current.input);
      if (started.state === "dispatch-wait-local") return safeReport(started, current.input.slotId);
      if (started.state !== "attempting-local" || !started.started) {
        pending = null;
        return safeReport(started, current.input.slotId);
      }
      const result = await recordMockCampaignOutcome(p, actor, {
        ...current.input,
        outcome: options.outcome,
        ...(options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }),
      });
      pending = null;
      return safeReport(result, current.input.slotId);
    } catch (error) {
      failed = true;
      throw error;
    }
  };
}
