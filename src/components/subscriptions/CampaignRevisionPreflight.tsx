"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import {
  preflightCounts,
  preflightBlockers,
  preflightActionHint,
} from "@/lib/subscription-campaign-revision-preflight";
import {
  loadCampaignRevisionPreflight,
  type RevisionPreflight,
} from "@/lib/subscription-campaign-revision-preflight-client";

export function CampaignRevisionPreflight({
  draft,
  initial,
  blocked,
  dirty,
  continued,
  paused,
  cancelled,
}: {
  draft: { campaignKey: string; revision: number };
  initial: RevisionPreflight;
  blocked?: boolean;
  dirty?: boolean;
  continued?: boolean;
  paused?: boolean;
  cancelled?: boolean;
}) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function refresh() {
    if (blocked || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      setReport(await loadCampaignRevisionPreflight(draft));
      setNotice("预检已更新。");
    } catch (error) {
      setNotice(
        (error instanceof Error ? error.message : "预检未更新。") +
          " 以下仍是上次报告，请核对查询时间。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="campaign-control" aria-label="同一活动改版续发预检" aria-busy={busy}>
      <h2>同一活动改版续发预检</h2>
      <p>仅评估已保存的第 {report.revision} 版与原冻结名单，不补入后来订阅的人。</p>
      {dirty && <p>有未保存的政策选择，当前报告仍基于已保存版本。</p>}
      <p>
        候选不代表可立即领取；本次查询不占额度，不修改任务、尝试、租约或审计。续发仅处理合资格虚构邮箱任务。
      </p>
      <p>{preflightActionHint(report, { continued, dirty, blocked, paused, cancelled })}</p>
      <p>
        后续执行仍须核对权限、余额与额度、同邮箱15分钟间隔和滚动24小时5次、全站每秒1次、确认/资料邮件优先及原重试规则。
      </p>
      {report.snapshot && (
        <p>
          原冻结名单为第 {report.snapshot.revision} 版，共 {report.total} 项。
        </p>
      )}
      <dl className="campaign-task-counts">
        {Object.entries(preflightCounts).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{report.counts[key as keyof typeof preflightCounts]}</dd>
          </div>
        ))}
      </dl>
      <p>
        以上按历史、取消、资格、领取、候选顺序互斥统计；已尝试任务保留原正文与重试历史，取消任务不会复活。
      </p>
      {report.blockers.length ? (
        <ul>
          {report.blockers.map((key) => (
            <li key={key}>{preflightBlockers[key]}</li>
          ))}
        </ul>
      ) : (
        <p>本次未发现上述阻断，仍仅供预检；提交续发时会重新核对条件。</p>
      )}
      <p>查询时间（北京时间）：{staffDateTime(report.asOf, true)}</p>
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        className="button"
        style={{ minHeight: 44 }}
        disabled={busy || blocked}
        onClick={refresh}
      >
        {busy ? "正在预检…" : "刷新改版预检"}
      </button>
    </section>
  );
}
