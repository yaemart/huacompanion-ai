"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import {
  loadCampaignFeedbackSummary,
  type FeedbackSummary,
} from "@/lib/subscription-campaign-feedback-summary-client";

const labels: Record<keyof FeedbackSummary["counts"], string> = {
  delivered: "送达回执",
  hardBounce: "永久退信",
  complaint: "投诉",
  providerSuppressed: "供应商邮件抑制",
  suppressed: "当前营销拒发（全局）",
};
export function CampaignFeedbackSummary({
  draft,
  initial,
}: {
  draft: { campaignKey: string; revision: number };
  initial: FeedbackSummary;
}) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      setSummary(await loadCampaignFeedbackSummary(draft));
    } catch (error) {
      setError(
        (error instanceof Error ? error.message : "回执汇总未更新。") +
          " 以下仍为上次统计，请核对统计时间。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="本地回执汇总" aria-busy={busy}>
      <h2>本地回执汇总</h2>
      <p>仅汇总本地模拟回执。模拟完成不等于送达，送达不代表阅读；无回执不等于未送达。</p>
      {error && <p role="alert">{error}</p>}
      {!summary.snapshot ? (
        <p>尚未冻结名单，暂无回执统计。</p>
      ) : (
        <>
          <p>
            原第 {summary.snapshot.revision} 版名单，共 {summary.total} 个邮箱。
          </p>
          {!summary.snapshot.current && <p>当前为新版，以下仍按原冻结名单汇总历史。</p>}
          <dl className="campaign-task-counts">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
              <div key={key}>
                <dt>{labels[key]}</dt>
                <dd>{summary.counts[key]}</dd>
              </div>
            ))}
          </dl>
          <p>各类邮件级回执按邮箱分别去重，可能重叠，不可相加当作总人数。</p>
          <p>全局拒发包含其他活动及邮箱级抑制，不代表本活动退信；迟到送达不会解除拒发。</p>
        </>
      )}
      <p>统计时间：{staffDateTime(summary.asOf, true)}（北京时间）。</p>
      <p>刷新只读，不重发、不清除拒发、不重置模拟确认，当前未保存选择仍保留。</p>
      <button type="button" className="button" disabled={busy} onClick={refresh}>
        {busy ? "正在刷新…" : "刷新回执汇总"}
      </button>
    </section>
  );
}
