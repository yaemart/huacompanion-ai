import { canEditContent, type ContentUser } from "../lib/content-model";
export function ContentNav({ user }: { user?: ContentUser }) {
  if (!canEditContent(user)) return null;
  return (
    <section aria-label="内容管理" style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>内容管理</h3>
      <a style={{ display: "block", padding: "8px 0" }} href="/content-center">
        知识与网站内容
      </a>
      <a
        style={{ display: "block", padding: "8px 0" }}
        href="/content-center?kind=provider-profile"
      >
        服务商展示内容
      </a>
      <a
        style={{ display: "block", padding: "8px 0" }}
        href="/content-center?kind=service-project"
      >
        华伴服务项目
      </a>
    </section>
  );
}
