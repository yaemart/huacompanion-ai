import type { Payload } from "payload";
import { readStaffToday } from "../server/workflow/staff-today";
import {
  canManageContent,
  canReviewContent,
  isActiveStaff,
  isAdmin,
  isManager,
  isOperator,
  type Staff,
} from "./access";
const time = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

async function Today({ user, payload }: { user?: Staff; payload: Payload }) {
  if (!isActiveStaff(user)) return null;
  const now = Date.now();
  const today = await readStaffToday(payload, user, now).catch(() => null);
  if (!today) return <p>暂时无法读取今日待办，请刷新后重试。</p>;
  return (
    <section aria-label="今日待办">
      <h2>今日待办</h2>
      <p>
        {today.date}（北京时间） · {today.items.length} 项
      </p>
      {!today.items.length && <p>今天暂无需要你处理的事项。</p>}
      {today.items.map(({ id, href, action, title, dueAt }) => (
        <a
          key={id}
          href={href}
          style={{ display: "block", padding: 12, minHeight: 44, overflowWrap: "anywhere" }}
        >
          <strong>
            {action} · {title}
          </strong>
          <br />
          {dueAt
            ? `${Date.parse(dueAt) < now ? "已逾期" : "截止"} · ${time.format(new Date(dueAt))}`
            : "待处理"}
        </a>
      ))}
    </section>
  );
}
export function Dashboard({ user, payload }: { user?: Staff; payload: Payload }) {
  return (
    <section
      style={{
        padding: 24,
        marginBottom: 24,
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
      }}
    >
      <Today user={user} payload={payload} />
      <h2>华伴 · 运营后台</h2>
      {isAdmin(user) && (
        <p>
          <a href="/admin/collections/staff">员工与授权</a> ·{" "}
          <a href="/admin/collections/teams">团队管理</a> ·{" "}
          <a href="/admin/collections/audit-events">操作记录</a>
        </p>
      )}
      {(canManageContent(user) || canReviewContent(user)) && (
        <p>
          <a href="/content-center">内容工作台：授权板块的编辑与审核 →</a>
        </p>
      )}
      {isOperator(user) && (
        <p>
          <a href="/operations-overview">经营概览与导出</a> ·{" "}
          <a href="/business-center">方案报价与履约</a> · <a href="/workflow-center">通知与待办</a>{" "}
          · <a href="/admin/collections/inquiries">客户咨询</a> ·{" "}
          <a href="/admin/collections/providers">机构与服务商合作档案</a>
        </p>
      )}
      {isAdmin(user) ? (
        <p>
          请先给业务记录分配团队，再分配负责人。历史未分配记录仅管理员可见。员工离职请停用账号并转交记录。
        </p>
      ) : isManager(user) ? (
        <p>你可以处理所属团队的业务记录，并分配给本团队运营人员。</p>
      ) : isOperator(user) ? (
        <p>你只能处理分配给自己的业务记录。需要转交时请联系主管。</p>
      ) : (
        <p>内容权限按授权板块开放；编辑与审核分工，客户和机构内部商务资料不在内容权限范围内。</p>
      )}
      <p>外部通知是否开放以通知设置和服务配置为准；站内记录不代表邮件已送达。</p>
      <p>
        <a href="/zh">中文网站</a> · <a href="/en">English website</a>
      </p>
    </section>
  );
}
