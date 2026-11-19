import { staffDate, staffDateTime } from "@/lib/staff-display";
import {
  subscriptionStates,
  type readSubscriptionManagement,
} from "@/server/subscription-management";
import { SubscriptionCsvDownload } from "./SubscriptionCsvDownload";

type Report = Awaited<ReturnType<typeof readSubscriptionManagement>>;
export function SubscriptionManagement({ report }: { report: Report }) {
  const label = (topic: string) => report.topics.find((row) => row.topic === topic)?.title ?? topic;
  const href = (page: number) =>
    "/subscription-center?" +
    new URLSearchParams({
      ...report.filters,
      page: String(page),
    });
  return (
    <main className="subscription-management">
      <a href="/admin">返回管理后台</a>
      <h1>订阅管理</h1>
      <p>
        统计截至 {staffDateTime(report.asOf)}（北京时间）。每条记录表示一个邮箱对一个主题的订阅。
      </p>
      <section aria-label="各主题订阅数量" className="subscription-table">
        <table>
          <caption>全部主题的当前状态</caption>
          <thead>
            <tr>
              <th scope="col">主题</th>
              {Object.values(subscriptionStates).map((name) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.topics.map((topic) => (
              <tr key={topic.topic}>
                <th scope="row">{label(topic.topic)}</th>
                <td>{topic.pending}</td>
                <td>{topic.confirmed}</td>
                <td>{topic.unsubscribed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form method="get" action="/subscription-center" className="subscription-filters">
        <label>
          主题
          <select name="topic" defaultValue={report.filters.topic}>
            <option value="">全部主题</option>
            {report.topics.map(({ topic }) => (
              <option value={topic} key={topic}>
                {label(topic)}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select name="status" defaultValue={report.filters.status}>
            <option value="">全部状态</option>
            {Object.entries(subscriptionStates).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button">
          查看
        </button>
      </form>
      <p role="status">
        符合筛选 {report.total} 条，第 {report.page} / {report.pages} 页。
      </p>
      <SubscriptionCsvDownload filters={report.filters} count={report.total} />
      <div className="subscription-table">
        <table>
          <caption>订阅记录 · 日期按北京时间显示</caption>
          <thead>
            <tr>
              {["邮箱", "主题", "语言", "状态", "申请日", "确认日", "退订日"].map((text) => (
                <th scope="col" key={text}>
                  {text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{label(row.topic)}</td>
                <td>{{ zh: "中文", en: "英文" }[row.locale] ?? row.locale}</td>
                <td>{subscriptionStates[row.status]}</td>
                <td>{staffDate(row.consentedAt)}</td>
                <td>{staffDate(row.confirmedAt)}</td>
                <td>{staffDate(row.unsubscribedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.rows.length && <p>暂无符合筛选的订阅记录。</p>}
      </div>
      <nav aria-label="订阅列表分页" className="subscription-pagination">
        {report.page > 1 && <a href={href(report.page - 1)}>上一页</a>}
        {report.page < report.pages && <a href={href(report.page + 1)}>下一页</a>}
      </nav>
    </main>
  );
}
