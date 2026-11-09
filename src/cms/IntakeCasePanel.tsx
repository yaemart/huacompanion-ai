import React from "react";
export type IntakeCasePhase = "loading" | "ready" | "error" | "unsaved";
export function IntakeCasePanel({
  title,
  caseID,
  busy,
  dirty,
  phase,
  message,
  onTitle,
  onCreate,
  onRetry,
}: {
  title: string;
  caseID?: number;
  busy: boolean;
  dirty: boolean;
  phase: IntakeCasePhase;
  message: string;
  onTitle: (value: string) => void;
  onCreate: () => void;
  onRetry: () => void;
}) {
  return (
    <section aria-label="咨询关联服务单" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
      <h3>服务单</h3>
      {caseID ? (
        <p>
          已关联服务单 #{caseID} ·{" "}
          <a href={`/business-center?id=${caseID}`} target="_blank" rel="noopener noreferrer">
            打开服务单（新标签页）
          </a>
        </p>
      ) : phase === "unsaved" ? (
        <p>请先保存咨询，再转为服务单。</p>
      ) : phase === "loading" ? (
        <p>正在读取关联服务单…</p>
      ) : phase === "error" ? (
        <button type="button" onClick={onRetry}>
          重新读取服务单
        </button>
      ) : (
        <>
          <label htmlFor="intake-case-title">服务单名称（仅用于创建）</label>
          <input
            id="intake-case-title"
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(e) => onTitle(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <button type="button" disabled={busy || dirty || !title.trim()} onClick={onCreate}>
            {busy ? "正在创建…" : "转为服务单"}
          </button>
          {dirty && <p>请先保存咨询资料修改，再创建服务单。</p>}
        </>
      )}
      <p>同一咨询只创建一张服务单；重复操作不会新建。服务单在新标签页打开，当前页面输入保留。</p>
      <p role="status">{message}</p>
    </section>
  );
}
