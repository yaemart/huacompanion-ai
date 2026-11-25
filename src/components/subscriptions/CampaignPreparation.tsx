"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import {
  preparationRequest,
  preparationRecovery,
  type PreparationCommand,
  type BudgetSnapshot,
} from "@/lib/subscription-campaign-preparation-client";
import { MockTaskRequestError } from "@/lib/subscription-campaign-task-client";

const labels = {
  "reserved-local": "占位已保存，可在下方领取演练",
  "already-reserved": "原占位已核实，没有再次占位",
  "budget-unavailable": "虚构余额快照不可用，请由管理员核对",
  "budget-exhausted": "虚构余额已用完",
  "daily-limit": "已达北京日2,000份上限",
  "email-limit": "同邮箱滚动24小时内已有占位",
  "no-candidate": "没有可新增占位的合资格虚构任务",
  ineligible: "当前资格不符，未新增占位",
};
export function CampaignPreparation({
  initialBudget,
  draft,
  eligible,
  disabled,
  onReserved,
  onBusyChange,
  onUncertainChange,
}: {
  initialBudget?: BudgetSnapshot;
  draft?: { campaignKey: string; revision: number };
  eligible: boolean;
  disabled: boolean;
  onReserved: (id: number) => void;
  onBusyChange: (value: boolean) => void;
  onUncertainChange: (value: boolean) => void;
}) {
  const [budget, setBudget] = useState(initialBudget);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<PreparationCommand | null>(null);
  const inFlight = useRef(false);
  const uncertain = !!pending.current && !busy;
  async function run(command: PreparationCommand) {
    if (disabled || inFlight.current) return;
    if (pending.current) command = preparationRecovery(pending.current);
    const reading = command.action === "read-mock-budget-local";
    if (!reading) pending.current = command;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      const result = await preparationRequest(command);
      if (result.kind === "read") {
        setBudget(result.budget);
        setNotice("已读取最新余额，请核对记录后再决定是否设置。");
      } else if (result.kind === "reserve") {
        setNotice(labels[result.reservation.state]);
        if (
          ["reserved-local", "already-reserved"].includes(result.reservation.state) &&
          result.reservation.id
        )
          onReserved(result.reservation.id);
      } else {
        setNotice("虚构余额设置已保存。");
        pending.current = null;
        onUncertainChange(false);
        try {
          const fresh = await preparationRequest({ action: "read-mock-budget-local", input: {} });
          if (fresh.kind === "read") setBudget(fresh.budget);
        } catch {
          setError("设置已保存，最新余额读取未完成，请稍后核对。");
        }
      }
      pending.current = null;
      onUncertainChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "准备结果待核实。");
      if (!reading) {
        const unknown = !(error instanceof MockTaskRequestError) || error.uncertain;
        if (!unknown) pending.current = null;
        onUncertainChange(unknown);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="本地模拟余额与占位准备">
      <h2>本地模拟余额与占位准备</h2>
      <p>
        仅使用虚构余额和@example.invalid任务，不代表供应商余额或真实发送。占位不等于领取或开始尝试。
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {budget && (
        <>
          <h3>管理员虚构余额</h3>
          <p>
            上次核对：{staffDateTime(budget.asOf, true)}（北京时间）。
            {budget.valid
              ? `可用 ${budget.remaining} 份。`
              : "快照不可用或已过期，不能据此继续占位。"}
          </p>
          {budget.id !== null && (
            <p>
              记录 {budget.id}，设置 {budget.configured} 份，有效至{" "}
              {staffDateTime(budget.expiresAt, true)}（北京时间）。原因：{budget.reason}
            </p>
          )}
          <button
            type="button"
            className="button"
            disabled={disabled || busy || pending.current?.action === "reserve-mock-slot-local"}
            onClick={() => run({ action: "read-mock-budget-local", input: {} })}
          >
            核对最新余额
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run({
                action: "set-mock-budget-local",
                input: { remaining: Number(amount), reason },
              });
            }}
          >
            <fieldset disabled={disabled || busy || uncertain}>
              <legend>设置虚构余额（有效1小时）</legend>
              <label>
                虚构可用份数（0–2,000）
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                设置原因（必填）
                <textarea
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="button">设置虚构余额</button>
            </fieldset>
          </form>
        </>
      )}
      {draft && (
        <fieldset disabled={disabled || busy || uncertain || !eligible}>
          <legend>为当前第 {draft.revision} 版准备一个任务占位</legend>
          <p>
            须先保存、模拟确认，并冻结当前名单或保存本版续发范围；暂停或取消后不能占位。全站北京日2,000份、同邮箱滚动24小时1份等原规则保持。
          </p>
          <button
            type="button"
            className="button"
            onClick={() =>
              run({
                action: "reserve-mock-slot-local",
                input: {
                  campaignKey: draft.campaignKey,
                  revision: draft.revision,
                  key: crypto.randomUUID(),
                },
              })
            }
          >
            准备一个任务占位
          </button>
        </fieldset>
      )}
      {uncertain && (
        <>
          <p>
            当前填写已保留，其他写入已锁定。余额设置只读取核对，不自动重设；占位只核实原操作，不会换编号再占一份。
          </p>
          <button
            type="button"
            className="button"
            disabled={disabled || busy}
            onClick={() => run(preparationRecovery(pending.current!))}
          >
            核实本次准备操作
          </button>
        </>
      )}
    </section>
  );
}
