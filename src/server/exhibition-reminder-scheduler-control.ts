import { randomUUID } from "node:crypto";
import type { AuditEvent } from "../../payload-types";
import type { Payload, PayloadRequest } from "payload";
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
import type { ReminderReport } from "./exhibition-reminders";
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
    const audit = (
      req: Parameters<typeof findExhibitionReminderAudit>[1],
      action: string,
      recordId: string,
      after: AuditEvent["after"],
    ) =>
      p.create({
        collection: "audit-events",
        req,
        data: { entity: "exhibition-reminder-scheduler", action, recordId, actor: owner, after },
      });
    const change = async (
      operation: (
        state: Awaited<ReturnType<typeof readSchedulerLedger>>["state"],
        req: Parameters<typeof findExhibitionReminderAudit>[1],
        revision: number,
      ) => Promise<void>,
    ) => {
      if (busy) throw new ContentError("本次调度操作尚未结束。", 409);
      busy = true;
      try {
        await check();
        const result = await withLockedReminderAuthority(p, headers, async ({ req, user }) => {
          await check();
          if (user.id !== owner) throw new ContentError("登录会话已变化。", 403);
          const { state, revision } = await readSchedulerLedger(p, req);
          await operation(state, req, revision);
          const valid = parseSchedulerLedger({ revision: 1, state }).state;
          return audit(req, "state-v1", "global", valid);
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
      apply: async (run, receipt) => {
        if (busy || activeRun !== run) throw new ContentError("调度上下文已变化。", 409);
        busy = true;
        try {
          await check();
          const { applyExhibitionReminders } = await import("./exhibition-reminders");
          return await applyExhibitionReminders(
            p,
            headers,
            receipt,
            schedulerPermit(p, run, check),
          );
        } catch (error) {
          live = false;
          throw error;
        } finally {
          busy = false;
        }
      },
      resolve: async (expected, reason) => {
        if (activeRun) throw new ContentError("请先停止原运行，再用新恢复会话核实。", 409);
        if (
          !Number.isSafeInteger(expected) ||
          expected < 1 ||
          typeof reason !== "string" ||
          !reason.trim() ||
          reason.trim().length > 500
        )
          throw new ContentError("请提供有效状态版本和1至500字符的核实原因。", 400);
        let outcome: "committed" | "closed-uncommitted" = "closed-uncommitted";
        let scope: ReminderScope;
        const result = await change(async (state, req, revision) => {
          if (revision !== expected || !state.pending)
            throw new ContentError("未决状态已变化，请重新查询。", 409);
          scope = state.pending.scope;
          if (await findExhibitionReminderAudit(p, req, state.owner!, state.pending.digest, scope))
            outcome = "committed";
          await audit(
            req,
            outcome === "committed" ? "verified-committed-v1" : "closed-uncommitted-v1",
            state.pending.digest,
            {
              version: 1,
              runId: state.runId,
              originalActor: state.owner,
              scope,
              reason: reason.trim(),
            },
          );
          Object.assign(state, { runId: null, owner: null, targets: [], pending: null });
        });
        return { state: "resolved", outcome, ...result, scope: scope! };
      },
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
          await audit(req, "pending-v1", digest, { version: 1, runId: run, scope });
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
  apply: (run: string, receipt: string) => Promise<ReminderReport>;
  resolve: (
    revision: number,
    reason: string,
  ) => Promise<{
    state: "resolved";
    outcome: "committed" | "closed-uncommitted";
    revision: number;
    scope: ReminderScope;
  }>;
  begin: (targets: ReminderScope[]) => Promise<{ runId: string; revision: number }>;
  prepare: (run: string, receipt: string) => Promise<{ revision: number }>;
  finish: (run: string, receipt: string) => Promise<{ revision: number }>;
  stop: (run: string) => Promise<void>;
};

export type SchedulerWritePermit = { readonly scheduler: unique symbol };
const permits = new WeakMap<
  SchedulerWritePermit,
  { p: Payload; run: string; check: () => Promise<void> }
>();
function schedulerPermit(
  p: Payload,
  run: string,
  check: () => Promise<void>,
): SchedulerWritePermit {
  const permit = {} as SchedulerWritePermit;
  permits.set(permit, { p, run, check });
  return permit;
}
export async function assertSchedulerReceiptWritable(
  p: Payload,
  req: Partial<PayloadRequest>,
  user: { id: number },
  receipt: string,
  permit?: SchedulerWritePermit,
) {
  const digest = reminderHash(receipt);
  const { docs } = await p.find({
    collection: "audit-events",
    depth: 0,
    req,
    where: {
      and: [
        { entity: { equals: "exhibition-reminder-scheduler" } },
        { recordId: { equals: digest } },
      ],
    },
    sort: "-id",
    limit: 1,
  });
  if (!docs.length && !permit) return;
  const proof = permit && permits.get(permit);
  const association = docs[0];
  if (!proof || proof.p !== p || association?.action !== "pending-v1")
    throw new ContentError("此调度回执不可再次应用，请先核实持久状态。", 409);
  await proof.check();
  const { state } = await readSchedulerLedger(p, req);
  const seal = parseReminderEnvelope(receipt);
  const after = association.after as {
    version: number;
    runId: string;
    scope: { key: string; locale: string };
  };
  if (
    after?.version !== 1 ||
    after.runId !== proof.run ||
    association.actor !== user.id ||
    state.runId !== proof.run ||
    state.owner !== user.id ||
    seal.actor !== user.id ||
    state.pending?.digest !== digest ||
    state.pending.scope.key !== seal.key ||
    state.pending.scope.locale !== seal.locale ||
    after.scope?.key !== seal.key ||
    after.scope.locale !== seal.locale
  )
    throw new ContentError("调度运行或未决回执已变化。", 409);
}
