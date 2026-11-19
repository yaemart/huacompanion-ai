"use client";
import { useRef, useState } from "react";

export function SubscriptionCsvDownload({
  filters,
  count,
}: {
  filters: { topic: string; status: string };
  count: number;
}) {
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function download() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscriptions/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const failure = await response.json();
        throw Error(failure.error || "导出未完成，请稍后重试。");
      }
      const file = URL.createObjectURL(await response.blob());
      try {
        const link = document.createElement("a");
        link.href = file;
        link.download =
          response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
          "subscriptions.csv";
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(file), 1000);
      }
      setMessage(`已生成 ${response.headers.get("X-Export-Count") || 0} 条订阅记录。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出未完成，请稍后重试。");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="subscription-export">
      <button type="button" className="button" disabled={pending} onClick={() => void download()}>
        {pending ? "正在生成 CSV…" : `导出筛选结果 CSV（${count} 条）`}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
