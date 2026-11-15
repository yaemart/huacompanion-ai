"use client";

import { useState } from "react";

export function MonthlyCsvDownload({ month, staff }: { month: string; staff: number | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/monthly-performance-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, ...(staff === null ? {} : { staff: String(staff) }) }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw Error(result.error || "月报导出未完成，请稍后重试。");
      }
      const file = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = file;
      link.download = `staff-monthly-${month}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(file), 1000);
      setMessage("月报 CSV 已生成。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "月报导出未完成，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void download()}>
        {busy ? "正在生成 CSV…" : staff === null ? "导出全员月报 CSV" : "导出当前月报 CSV"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
