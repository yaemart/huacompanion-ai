import {
  isOperator,
  canAccessContentKind,
  canManageContent,
  canReviewContent,
  type Staff,
} from "./access";
export function ContentNav({ user }: { user?: Staff }) {
  if (!canManageContent(user) && !canReviewContent(user))
    return isOperator(user) ? (
      <span>
        <a href="/support-center">客服工作台</a> · <a href="/business-center">报价与履约</a> ·{" "}
        <a href="/workflow-center">通知待办</a> · <a href="/operations-overview">经营概览与导出</a>
      </span>
    ) : null;
  const links = [
    ["guide", "来华指南"],
    ["service", "服务介绍"],
    ["faq", "常见问题"],
    ["page", "网站页面"],
    ["partner", "公开伙伴"],
    ["venue", "体验场所与餐馆"],
    ["activity", "体验活动"],
    ["institution", "医疗与康养机构"],
    ["exhibition", "展会信息"],
    ["provider-profile", "服务商展示内容"],
    ["service-project", "华伴服务项目"],
  ];
  return (
    <section aria-label="内容管理" style={{ marginBottom: 24 }}>
      {isOperator(user) && (
        <span>
          <a href="/support-center">客服工作台</a> · <a href="/business-center">报价与履约</a> ·{" "}
          <a href="/workflow-center">通知待办</a> ·{" "}
          <a href="/operations-overview">经营概览与导出</a>
        </span>
      )}
      <p>
        <a href="/quality-center">内容质量与复核</a> · <a href="/workflow-center">内容待办</a>
      </p>
      <h3 style={{ fontSize: 14 }}>内容管理</h3>
      {links
        .filter(([kind]) => canAccessContentKind(user, kind))
        .map(([kind, label]) => (
          <a
            key={kind}
            style={{ display: "block", padding: "8px 0" }}
            href={`/content-center?kind=${kind}`}
          >
            {label}
          </a>
        ))}
    </section>
  );
}
