import type { OverviewDetail, OverviewPage } from "../../lib/crm-overview";
import type { AssignmentEvent } from "../../lib/crm-assignments";
import { ownerLabel, followUpLabel } from "../../lib/crm-overview-view";
import { stageLabels } from "../../lib/business";
import { inquiryStatusLabels, type InquiryStatus } from "../../lib/inquiry-status";
import { Pager } from "./Pager";
export function CustomerOverview({
  data,
  history,
  disabled,
  onPage,
  onHistoryPage,
}: {
  data: OverviewDetail;
  history?: OverviewPage<AssignmentEvent>;
  disabled: boolean;
  onPage: (page: number) => void;
  onHistoryPage?: (page: number) => void;
}) {
  const c = data.client;
  return (
    <section aria-label="客户总览">
      <h2 tabIndex={-1}>{c.displayName}</h2>
      <p>
        {c.reference} · {c.kind === "company" ? "企业客户" : "个人客户"} · 第 {c.revision} 版 ·{" "}
        {c.status === "active" ? "使用中" : "已存档（只读）"}
      </p>
      <p>主负责人：{ownerLabel(c.ownerDisplay)}</p>
      <p>
        语言：{c.language === "zh" ? "中文" : "英文"} · 国家／地区代码：{c.countryCode || "未填写"}
      </p>
      <div className="crm-metrics">
        <p>
          可见进行中咨询 <strong>{c.visibleInquiryCount}</strong>
        </p>
        <p>
          可见进行中服务单 <strong>{c.visibleCaseCount}</strong>
        </p>
      </div>
      <p>最早现有跟进：{followUpLabel(c.nextFollowUp)}</p>
      <p>主联系人：{data.primaryContact?.name || "未设置"}</p>
      <h3>当前可见业务</h3>
      {!data.inquiries.items.length && <p>当前权限范围内暂无业务。</p>}
      <ul className="crm-cards">
        {data.inquiries.items.map((q) => (
          <li key={q.id}>
            <strong>
              {q.reference} · {q.name}
            </strong>
            <p>
              {inquiryStatusLabels[q.status as InquiryStatus] || q.status} · 负责人：
              {ownerLabel(q.ownerDisplay)}
            </p>
            <p>现有跟进：{followUpLabel(q.nextFollowUp)}</p>
            {q.needsReview && <p className="crm-warning">状态或归属需管理员核对。</p>}
            {q.serviceCase && (
              <>
                <p>
                  服务单：{q.serviceCase.title} ·{" "}
                  {stageLabels[q.serviceCase.stage] || q.serviceCase.stage}
                </p>
                {q.serviceCase.latestQuote && (
                  <p>
                    报价第 {q.serviceCase.latestQuote.revision} 版 · 状态{" "}
                    {q.serviceCase.latestQuote.status}
                  </p>
                )}
              </>
            )}
            {q.serviceCase ? (
              <a href={`/business-center?id=${q.serviceCase.id}`}>打开原报价与履约工作台</a>
            ) : (
              <a href={`/admin/collections/inquiries/${q.id}`}>打开原咨询</a>
            )}
          </li>
        ))}
      </ul>
      <Pager label="业务" data={data.inquiries} disabled={disabled} onPage={onPage} />
      <p>最近可见更新：{followUpLabel(c.lastVisibleUpdate)}</p>
      <details>
        <summary>最近更新（{data.recentUpdates.length} 项）</summary>
        <p>仅当前可见资料的最近更新时间，不是完整历史。</p>
        <ul className="crm-updates">
          {data.recentUpdates.map((e) => (
            <li key={`${e.kind}:${e.id}`}>
              {e.label} · {followUpLabel(e.at)}
            </li>
          ))}
        </ul>
      </details>
      {history && (
        <section aria-label="转交记录">
          <h3>转交记录</h3>
          {!history.items.length && <p>当前权限范围内暂无可见转交记录。</p>}
          <ul className="crm-cards">
            {history.items.map((e) => (
              <li key={e.id}>
                <strong>{followUpLabel(e.time)}</strong>
                <p>
                  {e.actorName || "操作人姓名当前不可用"} →{" "}
                  {e.recipientName || "接收人姓名当前不可用"}
                </p>
                <p>
                  当前可见变更：客户主负责人 {e.transferredClient ? 1 : 0} 项；咨询{" "}
                  {e.inquiryIDs.length} 项
                </p>
              </li>
            ))}
          </ul>
          <Pager
            label="转交记录"
            data={history}
            disabled={disabled}
            onPage={(n) => onHistoryPage?.(n)}
          />
        </section>
      )}
    </section>
  );
}
