"use client";

import { useRef, useState, type FormEvent } from "react";
import { staffDateTime } from "@/lib/staff-display";
import type { cancelMockCampaign } from "@/server/subscription-campaign-cancel";
import type { readCampaignPause } from "@/server/subscription-campaign-control";

type Control = Awaited<ReturnType<typeof readCampaignPause>>;
export function campaignControlInput(
  draft: { campaignKey: string; revision: number },
  paused: boolean,
  reason: string,
) {
  return { campaignKey: draft.campaignKey, revision: draft.revision, paused, reason };
}
export function campaignCancelInput(
  draft: { campaignKey: string; revision: number },
  reason: string,
  confirmed: boolean,
) {
  return { campaignKey: draft.campaignKey, revision: draft.revision, reason, confirmed };
}
export function CampaignPauseControls({
  draft,
  control,
  dirty,
  canResume,
  enabled,
  disabled,
  onChange,
  onBusyChange,
  uncertain,
  onUncertainChange,
}: {
  draft: { campaignKey: string; revision: number };
  control: Control;
  dirty: boolean;
  canResume: boolean;
  enabled: boolean;
  disabled?: boolean;
  onChange: (control: Control) => void;
  onBusyChange?: (busy: boolean) => void;
  uncertain: boolean;
  onUncertainChange: (uncertain: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const blocked = !enabled
    ? "仅支持本地模拟，真实发送未开放。"
    : disabled
      ? "正在处理其他操作，请稍后再试。"
      : uncertain
        ? "操作结果待核实，请先核实活动状态；原因和当前选择已保留。"
        : control.cancelledAt
          ? "本活动已取消，不能恢复或继续处理。"
          : control.paused && dirty
            ? "请先保存当前选择，并为新版本重新完成模拟确认，再恢复活动。"
            : control.paused && !canResume
              ? "请先生成模拟邮件并逐语言确认可读，再恢复活动。"
              : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run();
  }
  const cancelBlocked = !enabled || disabled || uncertain || !!control.cancelledAt;
  async function run(mode: "change" | "read" | "cancel" = "change") {
    const readOnly = mode === "read";
    if (
      pending.current ||
      !enabled ||
      disabled ||
      (mode === "change" && blocked) ||
      (mode === "cancel" && (cancelBlocked || !cancelConfirmed))
    )
      return;
    if (!readOnly && !reason.trim()) {
      setError("请填写暂停、恢复或取消的原因。");
      reasonField.current?.focus();
      return;
    }
    pending.current = true;
    setCancelConfirmed(false);
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/subscriptions/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: readOnly
            ? "read-control-local"
            : mode === "cancel"
              ? "cancel-local"
              : "control-local",
          input: readOnly
            ? { campaignKey: draft.campaignKey, revision: draft.revision }
            : mode === "cancel"
              ? campaignCancelInput(draft, reason, cancelConfirmed)
              : campaignControlInput(draft, !control.paused, reason),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        control?: Control;
        cancellation?: Awaited<ReturnType<typeof cancelMockCampaign>>;
      };
      let updated = result.control;
      if (mode === "cancel") {
        const receipt = result.cancellation;
        if (
          !response.ok ||
          !receipt ||
          receipt.campaignKey !== draft.campaignKey ||
          !receipt.cancelledAt
        )
          throw new Error(result.error || "取消结果待核实，请保留当前填写并核实活动状态。");
        updated = {
          ...control,
          cancelledAt: receipt.cancelledAt,
          cancelReason: receipt.reason,
          invalidatedLeases: receipt.invalidatedLeases,
        };
      }
      if (!response.ok || !updated || updated.campaignKey !== draft.campaignKey)
        throw new Error(result.error || "操作未完成，请保留原因并核实活动状态。");
      onChange(updated);
      onUncertainChange(false);
      if (!readOnly) setReason("");
      setNotice(
        readOnly
          ? "活动状态已核实，当前填写和选择已保留。"
          : updated.cancelledAt
            ? "活动已取消，不能恢复。历史记录和已占份额保留，未发送邮件。"
            : updated.paused
              ? `活动已暂停。本次使 ${updated.invalidatedLeases} 个未完成模拟任务的领取凭证失效，已完成记录保留。`
              : "活动已恢复本地模拟。未完成任务须重新领取，旧处理凭证不会复活；未发送邮件。",
      );
    } catch (failure) {
      onUncertainChange(true);
      setError(
        failure instanceof Error &&
          !(failure instanceof TypeError) &&
          !(failure instanceof SyntaxError)
          ? failure.message
          : "操作结果暂时无法确认，原因和选择已保留，请先核实活动状态。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  if (control.cancelledAt && !uncertain)
    return (
      <section className="campaign-control" aria-label="活动已取消">
        <h2>活动已取消（仅本地模拟）</h2>
        <p role="status">当前状态：已取消，未发送邮件。</p>
        <p>
          取消时间：{staffDateTime(control.cancelledAt)}（北京时间） · 原因：{control.cancelReason}
        </p>
        <p>本活动不能恢复或继续处理，取消前的历史记录和已占份额保留，不会归还额度。</p>
      </section>
    );
  return (
    <section className="campaign-control" aria-label="活动暂停与恢复">
      <h2>活动暂停与恢复（仅本地模拟）</h2>
      <p role="status">
        当前状态：
        {uncertain
          ? "待核实"
          : control.cancelledAt
            ? "已取消"
            : control.paused
              ? "已暂停"
              : "未暂停"}
        ，未发送邮件。
      </p>
      {control.cancelledAt && !uncertain && (
        <p>
          取消时间：{staffDateTime(control.cancelledAt)}（北京时间） · 原因：{control.cancelReason}
        </p>
      )}
      {control.changedAt && !uncertain && !control.cancelledAt && (
        <p>
          最近操作：{staffDateTime(control.changedAt)}（北京时间） · 原因：{control.reason}
        </p>
      )}
      <p>操作针对已保存的第 {draft.revision} 版。暂停保留历史和已完成记录，恢复只解除本地暂停。</p>
      {dirty && !control.paused && !uncertain && !control.cancelledAt && (
        <p>当前选择尚未保存，仍可暂停已保存的活动；本次操作不会丢弃当前选择。</p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {uncertain && (
        <button
          className="button"
          type="button"
          disabled={busy || disabled || !enabled}
          onClick={() => run("read")}
        >
          核实活动状态
        </button>
      )}
      <form onSubmit={submit} noValidate>
        <label>
          原因（必填）
          <textarea
            ref={reasonField}
            name="reason"
            required
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || disabled || !enabled || !!control.cancelledAt}
            aria-describedby="campaign-control-help"
          />
        </label>
        <p id="campaign-control-help">
          请说明本次暂停、恢复或取消的原因，最多500字符。重复同一状态不会覆盖旧原因。
        </p>
        {blocked && <p>{blocked}</p>}
        {control.paused && !control.cancelledAt && !canResume && (
          <p>
            <a href="#campaign-mock-checks">前往本地模拟测试与确认</a>
          </p>
        )}
        <button className="button" disabled={busy || !!blocked}>
          {busy
            ? "正在保存…"
            : control.cancelledAt
              ? "活动已取消"
              : control.paused
                ? "恢复本地活动"
                : "暂停本地活动"}
        </button>
      </form>
      <details className="campaign-cancel">
        <summary>取消本地活动（不可恢复）</summary>
        <p id="campaign-cancel-warning">
          <strong>取消后不能恢复。</strong>历史和已占份额保留，不会归还额度或重做已完成任务。
        </p>
        <p>请先填写上方原因。取消会停止已保存活动的未完成模拟任务，不发送邮件。</p>
        {dirty && <p>当前选择尚未保存，取消不会保存这些修改，取消后不能继续编辑本活动。</p>}
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            await run("cancel");
          }}
        >
          <label>
            <input
              type="checkbox"
              required
              checked={cancelConfirmed}
              onChange={(event) => setCancelConfirmed(event.target.checked)}
              disabled={busy || !!cancelBlocked}
              aria-describedby="campaign-cancel-warning"
            />
            我确认取消后不能恢复；历史和已占份额保留
          </label>
          <button className="button" disabled={busy || !!cancelBlocked || !cancelConfirmed}>
            确认取消本地活动
          </button>
        </form>
      </details>
    </section>
  );
}
