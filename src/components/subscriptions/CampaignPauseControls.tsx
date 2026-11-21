"use client";

import { useRef, useState, type FormEvent } from "react";
import { staffDateTime } from "@/lib/staff-display";
import type { readCampaignPause } from "@/server/subscription-campaign-control";

type Control = Awaited<ReturnType<typeof readCampaignPause>>;
export function campaignControlInput(
  draft: { campaignKey: string; revision: number },
  paused: boolean,
  reason: string,
) {
  return { campaignKey: draft.campaignKey, revision: draft.revision, paused, reason };
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
        : control.paused && dirty
          ? "请先保存当前选择，并为新版本重新完成模拟确认，再恢复活动。"
          : control.paused && !canResume
            ? "请先生成模拟邮件并逐语言确认可读，再恢复活动。"
            : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run();
  }
  async function run(readOnly = false) {
    if (pending.current || !enabled || disabled || (!readOnly && blocked)) return;
    if (!readOnly && !reason.trim()) {
      setError("请填写暂停或恢复原因。");
      reasonField.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/subscriptions/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: readOnly ? "read-control-local" : "control-local",
          input: readOnly
            ? { campaignKey: draft.campaignKey, revision: draft.revision }
            : campaignControlInput(draft, !control.paused, reason),
        }),
      });
      const result = (await response.json()) as { error?: string; control?: Control };
      if (!response.ok || !result.control || result.control.campaignKey !== draft.campaignKey)
        throw new Error(result.error || "操作未完成，请保留原因并刷新活动后重试。");
      onChange(result.control);
      onUncertainChange(false);
      if (!readOnly) setReason("");
      setNotice(
        readOnly
          ? "活动状态已核实，当前填写和选择已保留。"
          : result.control.paused
            ? `活动已暂停。本次停止了 ${result.control.invalidatedLeases} 项未完成模拟任务，已完成记录保留。`
            : "活动已恢复本地模拟。未完成任务须重新领取，旧处理凭证不会复活；未发送邮件。",
      );
    } catch (failure) {
      onUncertainChange(true);
      setError(
        failure instanceof Error ? failure.message : "网络暂时不可用，原因已保留，请稍后重试。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="活动暂停与恢复">
      <h2>活动暂停与恢复（仅本地模拟）</h2>
      <p role="status">
        当前状态：{uncertain ? "待核实" : control.paused ? "已暂停" : "未暂停"}，未发送邮件。
      </p>
      {control.changedAt && !uncertain && (
        <p>
          最近操作：{staffDateTime(control.changedAt)}（北京时间） · 原因：{control.reason}
        </p>
      )}
      <p>操作针对已保存的第 {draft.revision} 版。暂停保留历史和已完成记录，恢复只解除本地暂停。</p>
      {dirty && !control.paused && !uncertain && (
        <p>当前选择尚未保存，仍可暂停已保存的活动；本次操作不会丢弃当前选择。</p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {uncertain && (
        <button
          className="button"
          type="button"
          disabled={busy || disabled || !enabled}
          onClick={() => run(true)}
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
            disabled={busy || disabled || !enabled}
            aria-describedby="campaign-control-help"
          />
        </label>
        <p id="campaign-control-help">
          请说明本次暂停或恢复的原因，最多500字符。重复同一状态不会覆盖旧原因。
        </p>
        {blocked && <p>{blocked}</p>}
        {control.paused && !canResume && (
          <p>
            <a href="#campaign-mock-checks">前往本地模拟测试与确认</a>
          </p>
        )}
        <button className="button" disabled={busy || !!blocked}>
          {busy ? "正在保存…" : control.paused ? "恢复本地活动" : "暂停本地活动"}
        </button>
      </form>
    </section>
  );
}
