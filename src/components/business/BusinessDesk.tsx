"use client";
import { useEffect, useRef, useState } from "react";
import { businessStages, stageLabels } from "../../lib/business";
import QuoteReview from "./QuoteReview";
import BusinessAI from "./BusinessAI";
import { aiQuoteSendAllowed } from "../../lib/business-ai";
import CustomerLink from "../customer/CustomerLink";
const initialQuote = () => ({
  title: "",
  scope: "",
  included: "",
  excluded: "",
  terms: "",
  currency: "CNY",
  expiresAt: "",
  lines: [{ label: "服务费用", quantity: 1, unitMinor: 0 }],
  internalCostMinor: "",
});
export default function BusinessDesk() {
  const [data, setData] = useState<any>({ inquiries: [], cases: [] }),
    [id, setId] = useState<number>(),
    [view, setView] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [inquiry, setInquiry] = useState(""),
    [title, setTitle] = useState(""),
    [quote, setQuote] = useState(initialQuote),
    [stage, setStage] = useState("discovery"),
    [reason, setReason] = useState(""),
    [summary, setSummary] = useState(""),
    [at, setAt] = useState(""),
    [arrangement, setArrangement] = useState(""),
    [internal, setInternal] = useState(""),
    [provider, setProvider] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function read(target?: number) {
    const r = await fetch("/api/business" + (target ? "?id=" + target : ""), { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    return j;
  }
  async function refresh(target = id) {
    setData(await read());
    if (target) {
      const v = await read(target);
      setView(v);
      setSummary(v.case.customerSummary || "");
    }
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const d = await read();
        if (live) setData(d);
        if (id) {
          const v = await read(id);
          if (live) {
            setView(v);
            setSummary(v.case.customerSummary || "");
            setAt(v.case.scheduledAt?.slice(0, 16) || "");
            setArrangement(v.case.publicArrangement || "");
            setInternal(v.case.internalArrangement || "");
            setProvider(String(v.case.provider || ""));
            setConfirmed(false);
          }
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);
  async function act(action: string, extra: any = {}) {
    setBusy(true);
    setError("");
    const input = { action, ...(id ? { id, revision: view?.case.revision } : {}), ...extra };
    const signature = JSON.stringify(input);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: retry.current.key }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      retry.current = null;
      if (action === "create") setId(j.case);
      await refresh(j.case);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  }
  const c = view?.case;
  return (
    <main className="section support-page">
      <p>
        <a href="/admin">管理后台</a> · <a href="/workflow-center">通知与待办</a> ·{" "}
        <a href="/support-center">客服工作台</a>
      </p>
      <h1>方案报价与服务履约</h1>
      <p>报价发出表示客户中心可查看，不代表邮件已送达。客户确认不代表预约、付款或资源已落实。</p>
      {error && <p role="alert">{error}</p>}
      <div className="support-grid">
        <aside className="support-panel">
          <h2>权限内服务单</h2>
          <button
            disabled={busy}
            onClick={() => {
              setId(undefined);
              setView(undefined);
            }}
          >
            新建服务单
          </button>
          <ul>
            {data.cases.map((x: any) => (
              <li key={x.id}>
                <button
                  disabled={busy}
                  onClick={() => {
                    setView(undefined);
                    setId(x.id);
                    setQuote(initialQuote());
                  }}
                >
                  #{x.id} {x.title} · {stageLabels[x.stage]}
                </button>
              </li>
            ))}
          </ul>
          <p>展示最近200个权限内咨询关联服务单。</p>
        </aside>
        <section className="support-panel">
          {!id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act("create", { inquiry: Number(inquiry), title });
              }}
            >
              <h2>从咨询创建服务单</h2>
              <label>
                咨询
                <select required value={inquiry} onChange={(e) => setInquiry(e.target.value)}>
                  <option value="">请选择</option>
                  {data.inquiries.map((q: any) => (
                    <option key={q.id} value={q.id}>
                      {q.reference} · {q.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                服务单名称
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <button disabled={busy}>创建</button>
            </form>
          ) : c && c.id === id ? (
            <>
              <h2>
                #{id} {c.title}
              </h2>
              <p>
                <a href={`/admin/collections/inquiries/${view.inquiry.id}`}>
                  {view.inquiry.reference}
                </a>{" "}
                · {stageLabels[c.stage]} · 版本 {c.revision}
              </p>
              <CustomerLink inquiryID={view.inquiry.id} />
              <BusinessAI
                key={id}
                id={id}
                revision={c.revision}
                quotes={view.quotes}
                onChange={() => refresh(id)}
              />
              <details>
                <summary>客户可见进度说明</summary>
                <textarea
                  aria-label="客户进度说明"
                  maxLength={4000}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
                <button
                  disabled={busy}
                  onClick={() => act("summary", { customerSummary: summary })}
                >
                  保存说明
                </button>
              </details>
              <fieldset disabled={busy}>
                <legend>处理阶段</legend>
                <select
                  aria-label="目标阶段"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  {businessStages
                    .filter((s) => !["received", "awaiting-confirmation", "accepted"].includes(s))
                    .map((s) => (
                      <option key={s} value={s}>
                        {stageLabels[s]}
                      </option>
                    ))}
                </select>
                <label>
                  原因／完成说明
                  <input
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button disabled={!reason.trim()} onClick={() => act("stage", { stage, reason })}>
                  更新阶段
                </button>
                <p>服务器会检查阶段顺序；客户确认与报价发出由对应操作生成。</p>
              </fieldset>
              <h3>方案与报价版本</h3>
              {view.quotes.map((q: any) => (
                <article key={q.id} className="support-message">
                  <strong>
                    第{q.revision}版 · {q.title} ·{" "}
                    {
                      (
                        {
                          draft: "草稿",
                          sent: "待客户确认",
                          accepted: "客户已确认",
                          superseded: "被新版替代",
                          withdrawn: "已撤回",
                        } as any
                      )[q.status]
                    }
                  </strong>
                  <p>{q.scope}</p>
                  <p>
                    包含：{q.included}
                    <br />
                    不包含：{q.excluded}
                    <br />
                    变更规则：{q.terms}
                  </p>
                  <ul>
                    {q.lines.map((l: any, i: number) => (
                      <li key={i}>
                        {l.label} × {l.quantity}：{(l.unitMinor / 100).toFixed(2)} {q.currency}
                      </li>
                    ))}
                  </ul>
                  <p>
                    合计 {(q.totalMinor / 100).toFixed(2)} {q.currency} · 有效至{" "}
                    {new Date(q.expiresAt).toLocaleString()}
                  </p>
                  {view.canCost && q.internalCostMinor != null && (
                    <p>内部成本（客户不可见）：{(q.internalCostMinor / 100).toFixed(2)}</p>
                  )}
                  <QuoteReview quote={q} canReview={view.canCost} busy={busy} act={act} />
                  {q.status === "draft" && (
                    <button
                      disabled={busy || !aiQuoteSendAllowed(q)}
                      onClick={() => act("send", { quote: q.id })}
                    >
                      发出此版本
                    </button>
                  )}
                  {["draft", "sent"].includes(q.status) && (
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => act("withdraw", { quote: q.id, reason })}
                    >
                      按上述原因撤回
                    </button>
                  )}
                </article>
              ))}
              <details>
                <summary>新建报价版本</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await act("quote", {
                        quote: {
                          ...quote,
                          expiresAt: new Date(quote.expiresAt).toISOString(),
                          ...(quote.internalCostMinor !== ""
                            ? {
                                internalCostMinor: Math.round(
                                  Number(quote.internalCostMinor) * 100,
                                ),
                              }
                            : { internalCostMinor: undefined }),
                        },
                      })
                    )
                      setQuote(initialQuote());
                  }}
                >
                  <fieldset disabled={busy}>
                    {[
                      ["title", "方案名称"],
                      ["scope", "服务范围"],
                      ["included", "包含项目"],
                      ["excluded", "不包含项目"],
                      ["terms", "变更与取消规则"],
                    ].map(([k, l]) => (
                      <label key={k}>
                        {l}
                        <textarea
                          required
                          maxLength={k === "title" ? 200 : 4000}
                          value={(quote as any)[k]}
                          onChange={(e) => setQuote({ ...quote, [k]: e.target.value })}
                        />
                      </label>
                    ))}
                    <label>
                      币种
                      <select
                        value={quote.currency}
                        onChange={(e) => setQuote({ ...quote, currency: e.target.value })}
                      >
                        {["CNY", "USD", "EUR", "GBP", "AED"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      有效期（本机时间）
                      <input
                        type="datetime-local"
                        required
                        value={quote.expiresAt}
                        onChange={(e) => setQuote({ ...quote, expiresAt: e.target.value })}
                      />
                    </label>
                    {quote.lines.map((l, i) => (
                      <fieldset key={i}>
                        <legend>费用 {i + 1}</legend>
                        <label>
                          名称
                          <input
                            required
                            value={l.label}
                            onChange={(e) =>
                              setQuote({
                                ...quote,
                                lines: quote.lines.map((x, j) =>
                                  j === i ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          数量
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            required
                            value={l.quantity}
                            onChange={(e) =>
                              setQuote({
                                ...quote,
                                lines: quote.lines.map((x, j) =>
                                  j === i ? { ...x, quantity: Number(e.target.value) } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          单价
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            required
                            value={l.unitMinor / 100}
                            onChange={(e) =>
                              setQuote({
                                ...quote,
                                lines: quote.lines.map((x, j) =>
                                  j === i
                                    ? { ...x, unitMinor: Math.round(Number(e.target.value) * 100) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        {quote.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuote({ ...quote, lines: quote.lines.filter((_, j) => j !== i) })
                            }
                          >
                            移除该费用
                          </button>
                        )}
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      disabled={quote.lines.length >= 30}
                      onClick={() =>
                        setQuote({
                          ...quote,
                          lines: [...quote.lines, { label: "", quantity: 1, unitMinor: 0 }],
                        })
                      }
                    >
                      增加费用项
                    </button>
                    {view.canCost && (
                      <label>
                        内部成本（可留空，金额同币种）
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={quote.internalCostMinor}
                          onChange={(e) =>
                            setQuote({ ...quote, internalCostMinor: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <button>保存新版本草稿</button>
                  </fieldset>
                </form>
              </details>
              <details>
                <summary>落实服务安排</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("arrange", {
                      scheduledAt: new Date(at + "Z").toISOString(),
                      publicArrangement: arrangement,
                      internalArrangement: internal,
                      provider: provider ? Number(provider) : undefined,
                      resourceConfirmed: confirmed,
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <label>
                      服务时间（UTC）
                      <input
                        type="datetime-local"
                        value={at}
                        required
                        onChange={(e) => setAt(e.target.value)}
                      />
                    </label>
                    <label>
                      对客安排
                      <textarea
                        required
                        maxLength={4000}
                        value={arrangement}
                        onChange={(e) => setArrangement(e.target.value)}
                      />
                    </label>
                    <label>
                      内部交接（客户不可见）
                      <textarea
                        maxLength={4000}
                        value={internal}
                        onChange={(e) => setInternal(e.target.value)}
                      />
                    </label>
                    <label>
                      履约服务商后台编号（华伴自营可留空）
                      <input
                        type="number"
                        min={1}
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        required
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      已实际核实人员／服务商与档期
                    </label>
                    <button>保存安排</button>
                  </fieldset>
                </form>
              </details>
              <details>
                <summary>操作记录</summary>
                <ul>
                  {view.events.map((v: any) => (
                    <li key={v.id}>
                      {new Date(v.createdAt).toLocaleString()} · {v.action} {v.reason || ""}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p>正在读取…</p>
          )}
        </section>
      </div>
    </main>
  );
}
