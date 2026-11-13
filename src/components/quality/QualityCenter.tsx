"use client";
import { useEffect, useState } from "react";
import { localeNames, type Locale } from "@/lib/locales";
const status: Record<string, string> = {
  missing: "缺少译文",
  independent: "独立维护",
  current: "已核对原稿",
  "review-needed": "待复核",
};
const fields: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  blocks: "正文",
  sources: "来源",
  catalog: "服务资料",
  exhibition: "展会资料",
  institution: "机构资料",
  lifestyle: "生活信息",
};
export function QualityCenter() {
  const [desk, setDesk] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    const r = await fetch("/api/quality", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setDesk(d);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (desk && window.location.hash.startsWith("#quality-"))
      document.getElementById(window.location.hash.slice(1))?.focus();
  }, [desk]);
  async function review(e: React.FormEvent<HTMLFormElement>, item: any) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: item.id,
          revision: item.revision,
          owner: Number(data.get("owner")),
          reason: data.get("reason"),
          nextReviewAt: data.get("nextReviewAt"),
          sourceIds: data.getAll("sourceIds"),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await load();
      setNotice("复核已记录。正式内容需在内容工作台独立审核发布。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 24 }}>
      <a href="/content-center">← 内容工作台</a>
      <h1>内容质量</h1>
      <p>核对资料完整度、来源与七语言覆盖。复核记录不代表资质认证，也不会自动修改正式内容。</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!desk && !error && <p>正在加载…</p>}
      {desk?.items.length === 0 && <p>当前板块没有内容。</p>}
      {desk?.items.map((item: any) => (
        <article
          key={item.id}
          id={`quality-${item.id}`}
          tabIndex={-1}
          style={{ border: "1px solid #ccc", borderRadius: 12, padding: 24, marginTop: 20 }}
        >
          <h2>
            {item.title} · {localeNames[item.locale as Locale]}
          </h2>
          <p>
            {item.quality?.state === "checked" ? "已登记复核" : "待复核"} · 版本 {item.revision}
            {item.quality?.nextReviewAt && ` · 下次复核 ${item.quality.nextReviewAt.slice(0, 10)}`}
          </p>
          <p>
            {item.completeness.complete
              ? "基本资料已填写"
              : `待补充：${item.completeness.missing.map((f: string) => fields[f] || f).join("、")}`}
          </p>
          <ul>
            {Object.entries(item.coverage).map(([locale, state]) => (
              <li key={locale}>
                {localeNames[locale as Locale]}：{status[state as string]}
              </li>
            ))}
          </ul>
          {desk.canReview && (
            <form onSubmit={(e) => review(e, item)}>
              <fieldset disabled={busy}>
                <legend>登记本次复核</legend>
                <label>
                  负责人{" "}
                  <select name="owner" required defaultValue={item.quality?.owner || ""}>
                    <option value="">请选择</option>
                    {desk.owners
                      .filter((o: any) => o.kinds.includes(item.kind))
                      .map((o: any) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p>本次核对的来源：</p>
                {item.sources.map((s: any) => (
                  <label key={s.id} style={{ display: "block" }}>
                    <input type="checkbox" name="sourceIds" value={s.id} />{" "}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </label>
                ))}
                {!item.sources.length && <p>请先在内容工作台补充来源。</p>}
                <p>
                  <label>
                    复核依据{" "}
                    <textarea
                      name="reason"
                      required
                      maxLength={2000}
                      placeholder="说明核对内容、差异及仍需确认事项"
                    />
                  </label>
                </p>
                <p>
                  <label>
                    下次复核日期 <input type="date" name="nextReviewAt" required />
                  </label>
                </p>
                <button disabled={!item.sources.length} type="submit">
                  {busy ? "正在保存…" : "记录复核"}
                </button>
              </fieldset>
            </form>
          )}
        </article>
      ))}
    </main>
  );
}
