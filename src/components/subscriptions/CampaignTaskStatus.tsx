"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import { loadCampaignTaskStatus } from "@/lib/subscription-campaign-status-client";
import type { readCampaignTaskStatus } from "@/server/subscription-campaign-status";

type Status = Awaited<ReturnType<typeof readCampaignTaskStatus>>;
const labels: Record<keyof Status["counts"], string> = {
  unreserved: "未占位",
  ready: "待领取",
  leased: "已领取，尚未开始",
  attempting: "本地尝试中",
  retryWaiting: "等待重试",
  retryReady: "重试时间已到",
  review: "待核对",
  failed: "永久失败（本地）",
  completed: "模拟完成",
  cancelled: "资格已取消",
};

export function CampaignTaskStatus({
  draft,
  initial,
  blocked,
}: {
  draft: { campaignKey: string; revision: number };
  initial: Status;
  blocked?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function refresh() {
    if (pending.current || blocked) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setStatus(await loadCampaignTaskStatus(draft));
      setNotice("状态已更新，当前未保存的选择仍保留。");
    } catch (error) {
      setError(
        (error instanceof Error ? error.message : "统计未更新，请稍后重试。") +
          " 以下仍为上次统计，请核对统计时间。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="本地模拟任务状态" aria-busy={busy}>
      <h2>本地模拟任务状态</h2>
      <p>仅汇总原名单的本地记录，不代表邮件送达。刷新不会自动重发，也不会清除待核对状态。</p>
      <p>
        待核对包含结果不明、已开始尝试的租约到期及重试次数或时限耗尽，超时状态在读取时推导，刷新不改写记录。
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!status.snapshot ? (
        <p>尚未冻结名单，暂无本地任务。</p>
      ) : (
        <>
          <p>
            第 {status.snapshot.revision} 版名单，共 {status.total} 项任务，已开始 {status.attempts}{" "}
            次本地尝试。
          </p>
          {!status.snapshot.current && <p>这是旧版名单的历史状态，不包含当前版本的新任务。</p>}
          <dl className="campaign-task-counts">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
              <div key={key}>
                <dt>{labels[key]}</dt>
                <dd>{status.counts[key]}</dd>
              </div>
            ))}
          </dl>
          {status.nextAttemptAt && (
            <p>最早重试时间：{staffDateTime(status.nextAttemptAt, true)}（北京时间）。</p>
          )}
          <p>
            重试时间已到只表示等待结束，继续处理仍须核验授权、来源、资格、暂停和取消状态；本页不会自动运行任务。
          </p>
        </>
      )}
      <p>统计时间：{staffDateTime(status.asOf, true)}（北京时间）。</p>
      <button type="button" className="button" disabled={busy || blocked} onClick={refresh}>
        {busy ? "正在刷新…" : "刷新状态"}
      </button>
    </section>
  );
}
