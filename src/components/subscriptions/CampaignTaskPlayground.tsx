"use client";

import { useRef, useState, type FormEvent } from "react";
import { staffDateTime } from "@/lib/staff-display";
import {
  requestMockTask,
  taskLeaseAfter,
  MockTaskRequestError,
  type LocalLease,
  type TaskAction,
  type TaskCommand,
} from "@/lib/subscription-campaign-task-client";

const states = {
  "claimed-local": "已领取，尚未开始",
  busy: "任务已被领取，本页没有可用凭证，请稍后再领取",
  "attempting-local": "本地尝试已开始",
  "retry-local": "等待重试，到时须重新领取",
  "review-local": "待核对，不能在此清除或重试",
  "failed-local": "永久失败，已停止本地任务",
  "completed-local": "模拟完成，不代表邮件送达",
  ineligible: "当前资格不符合，未继续演练",
};
export function CampaignTaskPlayground({
  draft,
  slots,
  eligible,
  disabled,
  onBusyChange,
  onUncertainChange,
}: {
  draft: { campaignKey: string; revision: number };
  slots: number[];
  eligible: boolean;
  disabled?: boolean;
  onBusyChange: (value: boolean) => void;
  onUncertainChange: (value: boolean) => void;
}) {
  const [slotId, setSlotId] = useState(slots[0] ?? 0);
  const [lease, setLease] = useState<LocalLease>();
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof requestMockTask>>>();
  const [outcome, setOutcome] = useState("unknown");
  const [seconds, setSeconds] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<TaskCommand | null>(null);
  const inFlight = useRef(false);
  const uncertain = !!pending.current && !busy;
  async function run(action: TaskAction) {
    if (
      inFlight.current ||
      disabled ||
      (!pending.current && (!eligible || !slots.includes(slotId)))
    )
      return;
    const command = pending.current ?? {
      action,
      input: {
        campaignKey: draft.campaignKey,
        revision: draft.revision,
        slotId,
        ...(action !== "claim-mock-task-local" ? { token: lease?.token } : {}),
        ...(action === "record-mock-result-local"
          ? {
              outcome,
              ...(outcome === "rate-limited" ? { retryAfterMs: Number(seconds) * 1000 } : {}),
            }
          : {}),
      },
    };
    pending.current = command;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const updated = await requestMockTask(command);
      setReceipt(updated);
      setLease(taskLeaseAfter(lease, command.input.slotId, command.action, updated));
      pending.current = null;
      onUncertainChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "模拟操作结果待核实。");
      const unknown = !(error instanceof MockTaskRequestError) || error.uncertain;
      onUncertainChange(unknown);
      if (!unknown) {
        pending.current = null;
        setLease(undefined);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  function actionButton(action: TaskAction, label: string, blocked: boolean) {
    return (
      <button type="button" className="button" disabled={blocked} onClick={() => run(action)}>
        {label}
      </button>
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run("record-mock-result-local");
  }
  return (
    <section className="campaign-control" aria-label="本地模拟任务演练" aria-busy={busy}>
      <h2>本地模拟任务演练</h2>
      <p>
        只处理已占位的虚构任务，不发送邮件。领取不计尝试，开始后才计一次；最多5次、首次起23小时，待核对不能在此清除。
      </p>
      {!slots.length && (
        <p>
          暂无当前版本的已占位任务。余额和占位仍由现有本地服务准备，准备后重新打开本页；旧版名单不能续发。
        </p>
      )}
      {!eligible && (
        <p>
          当前条件不满足：需要已保存的当前版本、有效模拟确认和可用来源；已暂停或取消的活动不能演练。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {receipt && (
        <p role="status">
          {states[receipt.state]}
          {"attempts" in receipt && ` · 累计本地尝试 ${receipt.attempts} 次。`}
          {"nextAttemptAt" in receipt &&
            receipt.nextAttemptAt &&
            ` 下次不早于 ${staffDateTime(receipt.nextAttemptAt, true)}（北京时间）。`}
          请点击下方“刷新状态”更新汇总。
        </p>
      )}
      <fieldset disabled={disabled || busy || uncertain || !eligible || !slots.length}>
        <legend>选择任务并领取</legend>
        <label>
          已占位模拟任务
          <select
            value={slotId}
            disabled={!!lease}
            onChange={(e) => {
              setSlotId(Number(e.target.value));
              setReceipt(undefined);
            }}
          >
            {slots.map((id) => (
              <option key={id} value={id}>
                任务 {id}
              </option>
            ))}
          </select>
        </label>
        {actionButton("claim-mock-task-local", "领取所选任务", !!lease)}
        <p>
          凭证仅保存在本页，刷新会丢失。
          {lease && `有效至 ${staffDateTime(lease.expiresAt, true)}（北京时间）。`}
          开始后失效将停为待核对。
        </p>
        {actionButton("begin-mock-attempt-local", "开始本地尝试", lease?.phase !== "claimed")}
      </fieldset>
      <form onSubmit={submit}>
        <fieldset
          disabled={disabled || busy || uncertain || !eligible || lease?.phase !== "attempting"}
        >
          <legend>记录本地模拟结果</legend>
          <label>
            模拟结果
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="unknown">结果不明，转待核对</option>
              <option value="accepted">模拟完成</option>
              <option value="temporary">临时失败，按规则等待重试</option>
              <option value="rate-limited">429限速，等待后重试</option>
              <option value="permanent">永久失败，停止该任务</option>
            </select>
          </label>
          {outcome === "rate-limited" && (
            <label>
              等待秒数
              <input
                type="number"
                min="0"
                max="86400"
                step="1"
                required
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
          )}
          <button className="button" disabled={lease?.phase !== "attempting"}>
            记录模拟结果
          </button>
        </fieldset>
      </form>
      {uncertain && (
        <>
          <p>
            结果尚未核实，任务和结果选择已锁定，当前填写保留。只能核实原操作；领取核实返回已占用时不会恢复凭证。
          </p>
          {actionButton(pending.current!.action, "核实本次模拟操作", busy || !!disabled)}
        </>
      )}
    </section>
  );
}
