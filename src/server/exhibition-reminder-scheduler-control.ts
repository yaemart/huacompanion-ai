import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import {
  parseReminderEnvelope,
  reminderHash,
  type ReminderScope,
} from "../lib/exhibition-reminders";
import { parseSchedulerLedger } from "../lib/exhibition-reminder-scheduler-state";
import {
  authenticateReminderAdmin,
  withLockedReminderAuthority,
} from "./exhibition-reminder-authority";
import { readSchedulerLedger } from "./exhibition-reminder-scheduler-state";
import { findExhibitionReminderAudit } from "./exhibition-reminder-history";
import { ContentError } from "./content/error";

export async function withExhibitionScheduler<T>(
  p: Payload,
  headers: Headers,
  work: (s: SchedulerSession) => Promise<T>,
) {
  const owner = (await authenticateReminderAdmin(p, headers)).id;
  const client = await p.db.pool.connect();
  let live = true;
  client.on("error", () => {
    live = false;
  });
  client.on("end", () => {
    live = false;
  });
  let busy = false;
  let activeRun: string | undefined;
  const check = async () => {
    if (!live) throw new ContentError("调度会话已停止，请先核实持久状态。", 409);
    await client.query("SELECT 1");
  };
  try {
    await client.query("SET statement_timeout='10s'");
    if (!(await client.query("SELECT pg_try_advisory_lock(726291) AS held")).rows[0].held)
      throw new ContentError("调度或恢复正在运行，请先停止原进程。", 409);
    const change = async (
      operation: (
        state: Awaited<ReturnType<typeof readSchedulerLedger>>["state"],
        req: Parameters<typeof findExhibitionReminderAudit>[1],
      ) => Promise<void>,
    ) => {
      if (busy) throw new ContentError("本次调度操作尚未结束。", 409);
      busy = true;
      try {
        await check();
        const result = await withLockedReminderAuthority(p, headers, async ({ req, user }) => {
          await check();
          if (user.id !== owner) throw new ContentError("登录会话已变化。", 403);
          const { state } = await readSchedulerLedger(p, req);
          await operation(state, req);
          const valid = parseSchedulerLedger({ revision: 1, state }).state;
          return p.create({
            collection: "audit-events",
            req,
            data: {
              entity: "exhibition-reminder-scheduler",
              recordId: "global",
              action: "state-v1",
              actor: user.id,
              after: valid,
            },
          });
        });
        if (!(await p.findByID({ collection: "audit-events", id: result.id, disableErrors: true })))
          throw new ContentError("控制提交结果待核实，请保留原回执并查询状态。", 409);
        return { revision: result.id };
      } catch (error) {
        live = false;
        throw error;
      } finally {
        busy = false;
      }
    };
    const sameRun = (
      state: Awaited<ReturnType<typeof readSchedulerLedger>>["state"],
      run: string,
    ) => {
      if (activeRun !== run || state.runId !== run || state.owner !== owner)
        throw new ContentError("调度运行已变化。", 409);
    };
    const session: SchedulerSession = {
      begin: async (targets) => {
        const runId = randomUUID();
        const result = await change(async (state) => {
          if (state.pending) throw new ContentError("存在未决操作，请先核实结束。", 409);
          Object.assign(state, { version: 1, runId, owner, targets, pending: null });
        });
        activeRun = runId;
        return { ...result, runId };
      },
      prepare: async (run, receipt) =>
        change(async (state, req) => {
          sameRun(state, run);
          const seal = parseReminderEnvelope(receipt);
          const scope = { key: seal.key, locale: seal.locale };
          const digest = reminderHash(receipt);
          if (
            state.pending ||
            seal.actor !== owner ||
            !state.targets.some((t) => t.key === scope.key && t.locale === scope.locale)
          )
            throw new ContentError("未决操作或范围已变化。", 409);
          const associated = await p.find({
            collection: "audit-events",
            req,
            where: {
              and: [
                { entity: { equals: "exhibition-reminder-scheduler" } },
                { recordId: { equals: digest } },
              ],
            },
            limit: 1,
          });
          if (
            associated.docs.length ||
            (await findExhibitionReminderAudit(p, req, owner, digest, scope))
          )
            throw new ContentError("回执已有记录，请先核实。", 409);
          await p.create({
            collection: "audit-events",
            req,
            data: {
              entity: "exhibition-reminder-scheduler",
              recordId: digest,
              action: "pending-v1",
              actor: owner,
              after: { version: 1, runId: run, scope },
            },
          });
          state.pending = { digest, scope };
        }),
      finish: async (run, receipt) =>
        change(async (state, req) => {
          sameRun(state, run);
          if (
            !state.pending ||
            state.pending.digest !== reminderHash(receipt) ||
            !(await findExhibitionReminderAudit(
              p,
              req,
              owner,
              state.pending.digest,
              state.pending.scope,
            ))
          )
            throw new ContentError("未找到可确认提交，请保留未决操作。", 409);
          state.pending = null;
        }),
      stop: async (run) => {
        await change(async (state) => {
          sameRun(state, run);
          if (state.pending) throw new ContentError("存在未决操作，请先核实结束。", 409);
          Object.assign(state, { runId: null, owner: null, targets: [] });
        });
      },
    };
    return await work(session);
  } finally {
    live = false;
    client.release(true);
  }
}
export type SchedulerSession = {
  begin: (targets: ReminderScope[]) => Promise<{ runId: string; revision: number }>;
  prepare: (run: string, receipt: string) => Promise<{ revision: number }>;
  finish: (run: string, receipt: string) => Promise<{ revision: number }>;
  stop: (run: string) => Promise<void>;
};
