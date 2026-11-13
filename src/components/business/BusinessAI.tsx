"use client";
import { useEffect, useRef, useState } from "react";
import { aiTaskLabels } from "@/lib/business-ai";
import type { QuoteAmount } from "@/lib/quote-lines";
import { locales, localeNames } from "@/lib/locales";
const initial = () => ({
  currency: "CNY",
  expiresAt: "",
  lines: [{ label: "服务费用", quantity: 1, unitMinor: 0 }],
});
export default function BusinessAI({
  id,
  revision,
  onCopy,
  onChange,
}: {
  id: number;
  revision: number;
  onCopy: (
    draft: Omit<ReturnType<typeof initial>, "lines"> & { lines: QuoteAmount[] } & Record<
        "title" | "scope" | "included" | "excluded" | "terms",
        string
      >,
    task: { id: number; updatedAt: string },
  ) => void;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<any>({ tasks: [], enabled: false }),
    [brief, setBrief] = useState(""),
    [locale, setLocale] = useState("en"),
    [privacy, setPrivacy] = useState(false),
    [quote, setQuote] = useState<any>(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function refresh() {
    const r = await fetch("/api/business/ai?id=" + id, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, [id, revision]);
  async function action(action: string, extra: any = {}) {
    setBusy(true);
    setMessage("");
    const input = { action, id, revision, ...extra };
    const signature = JSON.stringify(input);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/business/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: retry.current.key }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      retry.current = null;
      await refresh();
      await onChange();
      setMessage("操作已保存。");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data.enabled && !data.tasks.length) return null;
  return (
    <section className="support-message">
      <h3>{data.enabled ? "AI 服务方案与报价助手" : "已有报价生成记录"}</h3>
      {data.enabled && (
        <p>
          只填写去除身份资料的业务摘要。费用由员工提供，AI
          不自行定价。采纳后仍须主管审核才能发给客户。
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button disabled={busy} onClick={() => refresh().catch((e) => setMessage(e.message))}>
        刷新生成状态
      </button>
      <ul>
        {data.tasks.map((t: any) => (
          <li key={t.id}>
            任务 #{t.id} · {aiTaskLabels[t.status]} {t.error && <p>{t.error}</p>}
            {t.result && (
              <details>
                <summary>查看 AI 原稿与待核实事项</summary>
                <p>{t.result.quote.title}</p>
                <p>{t.result.quote.scope}</p>
                <p>包含：{t.result.quote.included}</p>
                <p>不包含：{t.result.quote.excluded}</p>
                <p>规则：{t.result.quote.terms}</p>
                <ul>
                  {[...t.result.questions, ...t.result.warnings].map((x: string, i: number) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </details>
            )}
            {t.status === "succeeded" && t.result?.quote && (
              <button disabled={busy} onClick={() => onCopy(t.result.quote, t)}>
                整理此结果为报价草稿
              </button>
            )}
            {t.status === "adopted" && <p>已采纳，请在报价版本中另存。</p>}
            {data.enabled && t.status === "unconfigured" && (
              <button disabled={busy} onClick={() => action("queue", { task: t.id })}>
                配置后重新排队
              </button>
            )}
            {!["adopted", "cancelled"].includes(t.status) && (
              <button disabled={busy} onClick={() => action("cancel", { task: t.id })}>
                取消任务
              </button>
            )}
          </li>
        ))}
      </ul>
      <details hidden={!data.enabled}>
        <summary>填写生成要求与已核实费用</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!data.enabled) return;
            const expiresAt = new FormData(e.currentTarget).get("expiresAt");
            void action("create", {
              request: {
                brief,
                locale,
                privacyConfirmed: privacy,
                ...quote,
                expiresAt,
              },
            });
          }}
        >
          <fieldset disabled={busy}>
            {data.enabled && (
              <>
                <label>
                  目标语言
                  <select value={locale} onChange={(e) => setLocale(e.target.value)}>
                    {locales.map((l) => (
                      <option key={l} value={l}>
                        {localeNames[l]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  已核实的需求摘要（不要填写姓名、联系方式、证件、详细住址或健康隐私）
                  <textarea
                    required
                    maxLength={6000}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={privacy}
                    onChange={(e) => setPrivacy(e.target.checked)}
                  />
                  已去除身份及敏感资料，同意启用模型后将此摘要和费用明细用于生成
                </label>
              </>
            )}
            <label>
              币种
              <select
                value={quote.currency}
                onChange={(e) => setQuote({ ...quote, currency: e.target.value })}
              >
                {["CNY", "USD", "EUR", "GBP", "AED"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              报价有效期（北京时间）
              <input
                type="datetime-local"
                name="expiresAt"
                required
                value={quote.expiresAt}
                onChange={(e) => setQuote({ ...quote, expiresAt: e.target.value })}
              />
            </label>
            {quote.lines.map((l: any, i: number) => (
              <fieldset key={i}>
                <legend>已核实费用 {i + 1}</legend>
                <label>
                  项目
                  <input
                    required
                    maxLength={200}
                    value={l.label}
                    onChange={(e) =>
                      setQuote({
                        ...quote,
                        lines: quote.lines.map((x: any, j: number) =>
                          i === j ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  数量
                  <input
                    required
                    type="number"
                    min={1}
                    max={10000}
                    value={l.quantity}
                    onChange={(e) =>
                      setQuote({
                        ...quote,
                        lines: quote.lines.map((x: any, j: number) =>
                          i === j ? { ...x, quantity: Number(e.target.value) } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  单价
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitMinor / 100}
                    onChange={(e) =>
                      setQuote({
                        ...quote,
                        lines: quote.lines.map((x: any, j: number) =>
                          i === j
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
                      setQuote({
                        ...quote,
                        lines: quote.lines.filter((_: any, j: number) => i !== j),
                      })
                    }
                  >
                    移除费用
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
              增加费用
            </button>
            <p>
              合计{" "}
              {(
                quote.lines.reduce((n: number, l: any) => n + l.quantity * l.unitMinor, 0) / 100
              ).toFixed(2)}{" "}
              {quote.currency}
            </p>
            <button>提交 AI 生成任务</button>
          </fieldset>
        </form>
      </details>
    </section>
  );
}
