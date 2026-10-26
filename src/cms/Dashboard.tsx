export function Dashboard() {
  return (
    <section
      style={{
        padding: "24px",
        marginBottom: "24px",
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
      }}
    >
      <h2>华伴 · 本地运营后台</h2>
      <p>当前节点：真实咨询与合作申请保存、员工权限、跟进与变更记录。</p>
      <p>
        新咨询由管理员分配负责人，客户运营只可读取分配给自己的咨询。内容编辑暂不开放业务数据。
      </p>
      <p>
        邮件服务尚未配置，通知记录保存在“通知任务”中；记录存在不代表已发送。
      </p>
      <p>
        <a href="/zh">中文网站</a> · <a href="/en">English website</a>
      </p>
    </section>
  );
}
