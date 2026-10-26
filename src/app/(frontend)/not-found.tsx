export default function NotFound() {
  return (
    <main className="section">
      <span className="eyebrow">404 · HUA COMPANION</span>
      <h1 style={{ fontSize: 48, margin: "25px 0" }}>
        Page not found
        <br />
        页面未找到
      </h1>
      <p style={{ marginBottom: 25 }}>
        This page may have moved. / 该页面不存在或已移动。
      </p>
      <a className="button" href="/en">
        Home
      </a>{" "}
      <a className="text-link" href="/zh">
        返回首页 ↗
      </a>
    </main>
  );
}
