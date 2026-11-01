"use client";
import { useEffect, useState } from "react";
import {
  inquiryStatuses,
  providerStatuses,
  reportingCategories,
  type OperationsSummary,
} from "../../lib/reporting";
const labels: Record<string, string> = {
  new: "新咨询",
  "needs-info": "待补充",
  processing: "处理中",
  quoted: "已报价",
  won: "已成交",
  closed: "已关闭",
  applied: "已申请",
  verified: "已核实",
  contracted: "已签约",
  paused: "已暂停",
  housekeeping: "家政",
  medical: "医疗康养",
  business: "商务",
  transport: "交通",
  stays: "住宿",
  travel: "旅游",
  interpretation: "翻译",
  arrival: "抵达协助",
  website: "网站",
  app: "应用",
  manual: "人工录入",
};
function Counts({ title, values }: { title: string; values: Record<string, number> }) {
  return (
    <section>
      <h2>{title}</h2>
      {Object.keys(values).length ? (
        <table>
          <thead>
            <tr>
              <th>分类</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(values)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, count]) => (
                <tr key={key}>
                  <td>{labels[key] || key}</td>
                  <td>{count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : (
        <p>当前范围暂无记录</p>
      )}
    </section>
  );
}
export default function OperationsOverview() {
  const [filters, setFilters] = useState({ from: "", to: "", status: "", category: "" });
  const [summary, setSummary] = useState<OperationsSummary>();
  const [canSensitive, setCanSensitive] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [entity, setEntity] = useState("inquiries");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reporting?${new URLSearchParams(filters)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setSummary(result.summary);
      setCanSensitive(result.canSensitive);
      if (!result.canSensitive) setSensitive(false);
    } catch (error) {
      setError((error as Error).message);
      setSummary(undefined);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // Initial snapshot; later refreshes use the explicit filter button.
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reporting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, filters, includeSensitive: sensitive }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${entity}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="operations-overview"
      style={{ maxWidth: 1100, margin: "32px auto", padding: 24 }}
    >
      <p>
        <a href="/admin">返回中文运营后台</a> · <a href="/business-center">报价与履约</a>
      </p>
      <h1>经营概览与数据导出</h1>
      <p>
        管理员查看全部；主管查看所属团队；运营人员查看所属团队分配给自己的记录。筛选按记录创建日期，中国标准时间
        UTC+8，结束日期包含当天。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}
      >
        {(["from", "to"] as const).map((key) => (
          <label key={key}>
            {key === "from" ? "起始日期" : "结束日期"}
            <input
              type="date"
              value={filters[key]}
              onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
            />
          </label>
        ))}
        <label>
          状态
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">全部状态</option>
            {Array.from(new Set([...inquiryStatuses, ...providerStatuses])).map((status) => (
              <option key={status} value={status}>
                {labels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          服务类别
          <select
            value={filters.category}
            onChange={(event) => setFilters({ ...filters, category: event.target.value })}
          >
            <option value="">全部类别</option>
            {reportingCategories.map((category) => (
              <option key={category} value={category}>
                {labels[category]}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} type="submit">
          {busy ? "处理中…" : "刷新统计"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {error}
      </p>
      {summary && (
        <>
          <h2>咨询转化漏斗</h2>
          <p>
            新咨询 {summary.funnel.inquiries} → 已报价 {summary.funnel.quoted} → 已成交{" "}
            {summary.funnel.won}
          </p>
          <p>
            新咨询为筛选范围内累计进入数；已报价为当前已报价/已成交或有实际发出报价历史；已成交为当前已成交或报价有客户确认时间与确认人。每条咨询每阶段仅计一次。
          </p>
          <h2>首次响应时间中位数</h2>
          <p>
            {summary.firstResponse.medianMinutes === null
              ? "暂无可测历史"
              : `${summary.firstResponse.medianMinutes.toFixed(1)} 分钟`}
            ；已测 {summary.firstResponse.measuredCount} / {summary.firstResponse.total} 条咨询。
          </p>
          <p>
            从咨询创建到首次记录的报价发出操作，或可见关联客服会话的人工公开消息，以较早者为准。发送记录不代表邮件实际送达。创建前消息、内部备注、AI
            消息不计；缺少历史的咨询不参与中位数。
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 24,
            }}
          >
            <Counts title="咨询按周（中国时间周一开始）" values={summary.weeks} />
            <Counts title="咨询按服务类别（多选分别计数）" values={summary.categories} />
            <Counts title="咨询按状态" values={summary.statuses} />
            <Counts title="咨询按来源" values={summary.sources} />
            <Counts title="服务商申请按状态" values={summary.providerStatuses} />
          </div>
        </>
      )}
      <section>
        <h2>导出 CSV</h2>
        <p>
          使用上方当前筛选和实时员工权限；文件含 UTF-8
          BOM。默认不含内部备注、成本及原始表单隐私资料。每次导出记录操作者、时间、筛选和实际条数。
        </p>
        <label>
          数据类型
          <select value={entity} onChange={(event) => setEntity(event.target.value)}>
            <option value="inquiries">客户咨询</option>
            <option value="providers">服务商申请</option>
          </select>
        </label>{" "}
        {canSensitive && (
          <label>
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(event) => setSensitive(event.target.checked)}
            />
            显式包含内部备注；咨询另含报价版本、币种和内部成本（最小货币单位）
          </label>
        )}{" "}
        <button type="button" disabled={busy} onClick={() => void download()}>
          下载 CSV
        </button>
      </section>
    </main>
  );
}
