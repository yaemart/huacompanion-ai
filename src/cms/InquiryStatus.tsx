"use client";

import { useRef, useState } from "react";
import { useDocumentInfo, useField, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { SelectFieldClientComponent } from "payload";
import type { changeInquiryStatus } from "../server/inquiry-status";
import { randomClientID } from "../lib/client-id";
import {
  coordinationStageLabels,
  inquiryStatusLabels,
  isInquiryClosed,
  type InquiryPair,
} from "../lib/inquiry-status";

export const InquiryStatus: SelectFieldClientComponent = ({ readOnly }) => {
  const info = useDocumentInfo();
  const status = useField<InquiryPair["status"]>({ path: "status" });
  const stage = useField<InquiryPair["coordinationStage"]>({ path: "coordinationStage" });
  const editBase = useField<string>({ path: "updatedAt" });
  const dirty = useFormModified();
  const saving = useFormProcessing();
  const [mode, setMode] = useState<"close" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [nextStage, setNextStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const closed = isInquiryClosed({ status: status.value, coordinationStage: stage.value });
  const mismatch = (status.value === "closed") !== (stage.value === "closed");
  const locked = readOnly || saving || busy;
  const reopening = mode === "reopen";
  const actionLabel = reopening ? "重开" : "关闭";
  const disabled =
    locked || dirty || !info.id || !reason.trim() || (reopening && (!nextStatus || !nextStage));

  function begin(action: typeof mode) {
    setMode(action);
    setMessage("");
    setReason("");
    setNextStatus("");
    setNextStage("");
    retry.current = null;
  }

  async function submit() {
    if (!mode || disabled) return;
    setBusy(true);
    setMessage("");
    try {
      const input = {
        id: info.id,
        action: mode,
        updatedAt: info.data?.updatedAt,
        reason: reason.trim(),
        ...(reopening ? { status: nextStatus, coordinationStage: nextStage } : {}),
      };
      const signature = JSON.stringify(input);
      if (retry.current?.signature !== signature)
        retry.current = { signature, key: randomClientID() };
      const response = await fetch("/api/inquiry-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: retry.current.key }),
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json()) as Awaited<ReturnType<typeof changeInquiryStatus>> & {
        error?: string;
      };
      if (!response.ok) throw Error(result.error || "请重试");
      const { status: savedStatus, coordinationStage, updatedAt } = result;
      status.setValue(savedStatus, true);
      stage.setValue(coordinationStage, true);
      editBase.setValue(updatedAt, true);
      info.setData({ ...info.data, status: savedStatus, coordinationStage, updatedAt });
      info.setLastUpdateTime(Date.parse(result.updatedAt));
      if (!result.duplicate) info.incrementVersionCount();
      begin(null);
      setMessage(`已${actionLabel}咨询并记录原因。`);
    } catch (error) {
      setMessage(
        `${actionLabel}未完成，原因已保留。${error instanceof Error ? error.message : "请重试"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    {
      label: "处理状态",
      labels: inquiryStatusLabels,
      value: reopening ? nextStatus : status.value,
      change: reopening ? setNextStatus : status.setValue,
    },
    {
      label: "协调进度",
      labels: coordinationStageLabels,
      value: reopening ? nextStage : stage.value,
      change: reopening ? setNextStage : (value: string) => stage.setValue(value || null),
      empty: "未填写",
    },
  ];
  return (
    <div className="field-type">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {fields.map(({ label, labels, value, change, empty }) => (
          <label key={label}>
            {reopening && "重开后的"}
            {label}{" "}
            <select
              value={value ?? ""}
              disabled={locked || (!reopening && (closed || !!mode))}
              onChange={({ target }) =>
                target.value === "closed" ? begin("close") : change(target.value)
              }
            >
              {(reopening || empty) && <option value="">{reopening ? "请选择" : empty}</option>}
              {Object.entries(labels)
                .filter(([key]) => !reopening || key !== "closed")
                .map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <p>处理状态用于业务管理，协调进度记录实际协调进展。</p>
      {mismatch && <p role="status">请核对状态。此咨询的历史处理状态和协调进度不一致。</p>}
      {stage.value === "completed" && <p>协调已完成，成交状态另行确认。</p>}
      {closed && !mode && !readOnly && (
        <p>
          <button type="button" disabled={locked} onClick={() => begin("reopen")}>
            重开咨询
          </button>{" "}
          {mismatch && (
            <button type="button" disabled={locked} onClick={() => begin("close")}>
              将两项一起关闭
            </button>
          )}
        </p>
      )}
      {mode && (
        <fieldset disabled={locked} style={{ marginTop: "1rem", minWidth: 0 }}>
          <legend>{actionLabel}咨询</legend>
          <p>
            {mode === "close"
              ? "确认后，处理状态与协调进度将同时设为已关闭。"
              : "请选择重开后的处理状态和协调进度。"}
          </p>
          <label style={{ display: "block", margin: "0.75rem 0" }}>
            {actionLabel}原因（必填）
            <textarea
              rows={3}
              maxLength={2000}
              value={reason}
              style={{ display: "block", width: "100%" }}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {dirty && <p>请先保存其他修改，再{actionLabel}咨询。</p>}
          <button type="button" disabled={disabled} onClick={() => void submit()}>
            确认{actionLabel}
          </button>{" "}
          <button type="button" onClick={() => begin(null)}>
            取消
          </button>
        </fieldset>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
