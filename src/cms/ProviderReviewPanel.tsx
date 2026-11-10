"use client";
import { useId } from "react";
import { providerReviewLabels, type ProviderReviewStatus } from "../lib/provider-review";
export function ProviderReviewPanel({
  allowed,
  busy,
  dirty,
  reason,
  message,
  onReason,
  onReview,
}: {
  allowed: boolean;
  busy: boolean;
  dirty: boolean;
  reason: string;
  message: string;
  onReason: (value: string) => void;
  onReview: (status: ProviderReviewStatus) => void;
}) {
  const id = useId();
  if (!allowed) return <p>审核由业务主管或管理员处理；运营可整理资料、追加跟进。</p>;
  return (
    <section aria-label="服务商合作审核" style={{ margin: "16px 0", overflowWrap: "anywhere" }}>
      <h3>合作审核</h3>
      <p>每次必须填写原因。核实／签约不会自动公开；暂停撤销公开许可，恢复后需管理员重新许可。</p>
      {dirty && <p role="status">请先保存其他资料，再审核。</p>}
      <label htmlFor={id}>本次审核原因（必填）</label>
      <textarea
        id={id}
        value={reason}
        maxLength={2000}
        disabled={busy}
        onChange={(e) => onReason(e.target.value)}
        style={{ display: "block", width: "100%", minHeight: 80, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {(Object.keys(providerReviewLabels) as ProviderReviewStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy || dirty || !reason.trim()}
            onClick={() => onReview(status)}
          >
            {providerReviewLabels[status]}
          </button>
        ))}
      </div>
      {busy && <p role="status">正在保存审核，请勿重复操作…</p>}
      <p role="status">{message}</p>
    </section>
  );
}
