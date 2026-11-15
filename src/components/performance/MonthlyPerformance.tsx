import type { readMonthlyPerformance } from "@/server/performance/monthly";

type Report = Awaited<ReturnType<typeof readMonthlyPerformance>>;

const time = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "medium",
  timeStyle: "medium",
});
const count = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const rate = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function minutes(value: number | null) {
  return value === null ? "暂无样本" : count.format(value) + " 分钟";
}
function ratio(value: number, total: number) {
  return total ? rate.format(value / total) + `（${value}/${total}）` : "暂无样本";
}

const sources = {
  case: "服务投诉",
  content: "内容纠错",
  fact: "政策事实纠错",
  note: "政策说明纠错",
};
const reasons = { confirmation: "待确认", window: "申诉期内", review: "申诉待复核" };

export function MonthlyPerformance({ report }: { report: Report }) {
  const { period, people, staff, response, followup, incidents, review, overdueReviews, pending } =
    report;
  const metrics = [
    [
      "首次响应时长中位数",
      minutes(response.minutes),
      `${response.samples} 条有明确首次人工回复或发出报价的咨询`,
    ],
    [
      "按时跟进率",
      ratio(followup.onTime, followup.due),
      "按咨询跟进截止日及实际追加的跟进记录核对",
    ],
    ["有效投诉数", incidents.complaints, "按首次确认月份计入"],
    ["内容按计划发布数", "缺少计划数据", "当前内容记录没有计划发布日期"],
    [
      "审核退回率",
      ratio(review.returned, review.decisions),
      "按本月的内容、政策和报价审核结果计算",
    ],
    ["发布后纠错次数", incidents.corrections, "共用事实的双语纠错合计一件"],
    ["逾期复核待办数", overdueReviews, "截至月末或当前时点仍未办结，含更早月份遗留事项"],
    [
      "审核处理时长中位数",
      minutes(review.minutes),
      `${review.samples} / ${review.decisions} 次可配对送审的审核`,
    ],
  ] as const;
  return (
    <main className="performance-desk performance-monthly">
      <nav>
        <a href="/admin">管理后台</a> · <a href="/performance-center">投诉、纠错与申诉</a>
      </nav>
      <h1>个人业绩与月报</h1>
      <form method="get" action="/performance-center/monthly">
        <div>
          <label htmlFor="performance-month">月份（北京时间）</label>
          <input
            type="month"
            id="performance-month"
            name="month"
            defaultValue={period.month}
            min="2000-01"
            max={period.current}
            required
          />
        </div>
        {people && (
          <div>
            <label htmlFor="performance-person">员工</label>
            <select id="performance-person" name="staff" defaultValue={staff ?? ""}>
              <option value="">全部员工</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.active === false ? "（已停用）" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit">查看月报</button>
      </form>
      <h2>
        {period.month} · {report.name ?? "全员汇总"}
      </h2>
      <p>统计更新于 {time.format(new Date(report.asOf))}（北京时间）。跨月复核可更新首次确认月。</p>
      <dl className="performance-metrics">
        {metrics.map(([label, value, help]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <dd className="performance-metrics-help">{help}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="pending-performance">
        <h2 id="pending-performance">待定记录（{pending.length}）</h2>
        <p>待确认登记按登记月份展示。进入申诉期后按首次确认月份展示，待定期间暂缓计数。</p>
        {!pending.length && <p>本月暂无待定记录。</p>}
        {!!pending.length && (
          <ul>
            {pending.map(({ id, source, reason }) => (
              <li key={id}>
                <a href={`/performance-center?id=${id}`}>
                  {sources[source]} #{id}
                </a>{" "}
                · 待定（{reasons[reason]}）
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
