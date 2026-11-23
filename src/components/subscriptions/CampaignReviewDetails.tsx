"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import { reviewReasons, reviewOutcomes, reviewEvents } from "@/lib/subscription-campaign-review";
import { loadCampaignReviewDetails } from "@/lib/subscription-campaign-review-client";
import type { readCampaignReviewDetails } from "@/server/subscription-campaign-review";

export function CampaignReviewDetails({
  draft,
  initial,
  blocked,
}: {
  draft: { campaignKey: string; revision: number };
  initial: Awaited<ReturnType<typeof readCampaignReviewDetails>>;
  blocked?: boolean;
}) {
  const [details, setDetails] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function load(page: number) {
    if (blocked || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setDetails(await loadCampaignReviewDetails(draft, page));
      setNotice("明细已更新。");
    } catch (error) {
      setError(
        (error instanceof Error ? error.message : "明细未更新，请稍后重试。") +
          " 以下仍是上次明细，请核对查询时间。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="待核对任务明细" aria-busy={busy}>
      <h2>待核对任务明细</h2>
      <p>仅查看本地模拟记录，不代表邮件送达；查看、翻页和刷新不会重发或清除待核对。</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!details.snapshot ? (
        <p>尚未冻结名单，暂无待核对明细。</p>
      ) : (
        <>
          <p>
            第 {details.snapshot.revision} 版名单，共 {details.total} 项待核对。每页最多25项。
          </p>
          {!details.snapshot.current && <p>这是旧版冻结名单的历史记录。</p>}
          {!details.rows.length && (
            <p>{details.total ? "本页暂无记录，请返回上一页。" : "当前名单没有待核对任务。"}</p>
          )}
          {details.rows.map((row) => (
            <details key={row.slotId}>
              <summary style={{ minHeight: 44, padding: "12px 0", cursor: "pointer" }}>
                任务 #{row.slotId} · {reviewReasons[row.reason]}
              </summary>
              <p>
                共 {row.attemptedAt.length} 次尝试；最后模拟结果：
                {row.lastOutcome ? reviewOutcomes[row.lastOutcome] : "未记录"}。
              </p>
              <p>尝试时间（北京时间）：</p>
              <ol>
                {row.attemptedAt.map((at, i) => (
                  <li key={i}>
                    第 {i + 1} 次：{staffDateTime(at, true)}
                  </li>
                ))}
              </ol>
              <p>已有审计（北京时间）：</p>
              {!row.events.length && <p>暂无可显示的已有审计。</p>}
              <ol>
                {row.events.map((event, i) => (
                  <li key={i}>
                    {staffDateTime(event.at, true)} ·{" "}
                    {reviewEvents[event.action as keyof typeof reviewEvents]}
                  </li>
                ))}
              </ol>
              {row.hasOlderEvents && <p>仅显示最近20条审计；更早记录仍保留。</p>}
            </details>
          ))}
          <p>
            第 {details.page} 页，共 {Math.max(1, Math.ceil(details.total / 25))} 页。
          </p>
          <div className="subscription-pagination">
            <button
              type="button"
              className="button"
              disabled={busy || blocked || details.page <= 1}
              onClick={() => load(details.page - 1)}
            >
              上一页
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || blocked || details.page * 25 >= details.total}
              onClick={() => load(details.page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
      <p>查询时间：{staffDateTime(details.asOf, true)}（北京时间）。</p>
      <button
        type="button"
        className="button"
        disabled={busy || blocked}
        onClick={() => load(details.page)}
      >
        {busy ? "正在读取…" : "刷新待核对明细"}
      </button>
    </section>
  );
}
