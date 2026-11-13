"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locales";
import { customerCopy, customerStatus, customerNotificationCopy } from "@/lib/customer-copy";
import { quoteTimeLabel } from "@/lib/quote-time";
import type { QuoteLineView } from "@/lib/quote-lines";
export default function CustomerPortal({ locale }: { locale: Locale }) {
  const t = customerCopy(locale),
    nt = customerNotificationCopy[locale];
  const [data, setData] = useState<any>(null),
    [business, setBusiness] = useState<any>({ cases: [] }),
    [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [handle, setHandle] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [agree, setAgree] = useState<Record<string, boolean>>({});
  const refresh = useCallback(async () => {
    const r = await fetch("/api/customer", { cache: "no-store" });
    if (!r.ok) throw Error();
    const d = await r.json();
    setData(d);
    if (d.email) {
      const b = await fetch("/api/business/customer", { cache: "no-store" });
      if (!b.ok) throw Error();
      setBusiness(await b.json());
    } else setBusiness({ cases: [] });
  }, []);
  useEffect(() => {
    refresh().catch(() => setMessage(t[9]));
  }, [refresh, t]);
  async function action(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, token, handle, locale }),
      });
      const d = await r.json();
      if (!r.ok) throw Error();
      if (action === "request") {
        setHandle(d.handle);
        setMessage(t[8]);
      } else {
        setToken("");
        setHandle("");
        await refresh();
      }
    } catch {
      setMessage(t[9]);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(q: any) {
    if (!agree[q.id]) {
      setMessage(t[27]);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/business/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", quote: q.id, key: crypto.randomUUID() }),
      });
      if (!r.ok) throw Error();
      setMessage(t[28]);
      await refresh();
    } catch {
      setMessage(t[9]);
    } finally {
      setBusy(false);
    }
  }
  async function markRead(id: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read-notification", id }),
      });
      if (!r.ok) throw Error();
      await refresh();
    } catch {
      setMessage(t[9]);
    } finally {
      setBusy(false);
    }
  }
  const status = (value: string) => customerStatus[locale][value] || value;
  const date = (v: string) =>
    v
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(v),
        )
      : "";
  return (
    <main
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={{ maxWidth: 960, margin: "40px auto", padding: 24 }}
    >
      <h1>{t[0]}</h1>
      <p>{t[1]}</p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {data && !data.email && (
        <>
          {!data.available ? (
            <p>{t[7]}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(handle ? "verify" : "request");
              }}
            >
              <label>
                {t[2]}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setHandle("");
                  }}
                  autoComplete="email"
                />
              </label>
              {handle && (
                <label>
                  {t[4]}
                  <input
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value.trim())}
                    autoComplete="one-time-code"
                    maxLength={64}
                  />
                </label>
              )}
              <button disabled={busy} type="submit">
                {handle ? t[5] : t[3]}
              </button>
              {handle && (
                <button disabled={busy} type="button" onClick={() => action("request")}>
                  {t[3]}
                </button>
              )}
            </form>
          )}
        </>
      )}
      {data?.email && (
        <>
          <p>{data.email}</p>
          <button disabled={busy} onClick={() => action("logout")}>
            {t[6]}
          </button>{" "}
          <button disabled={busy} onClick={() => refresh().catch(() => setMessage(t[9]))}>
            {t[17]}
          </button>
          <h2>
            {nt[0]} · {nt[1]} {data.notifications?.filter((n: any) => !n.readAt).length || 0}
          </h2>
          {data.notifications?.map((n: any) => (
            <p key={n.id}>
              {nt[n.type === "quote-sent" ? 3 : n.type === "quote-confirmed" ? 4 : 5]} ·{" "}
              {date(n.createdAt)}{" "}
              {!n.readAt && (
                <button disabled={busy} onClick={() => markRead(n.id)}>
                  {nt[2]}
                </button>
              )}
            </p>
          ))}
          <h2>{t[10]}</h2>
          {!data.inquiries?.length && <p>{t[11]}</p>}
          {data.inquiries?.map((q: any) => (
            <p key={q.id}>
              {q.reference} · {status(q.status)} {q.stage && `· ${status(q.stage)}`}
            </p>
          ))}
          <h2>{t[12]}</h2>
          {business.cases?.map((c: any) => (
            <article key={c.id}>
              <h3>
                {c.title} · {c.reference}
              </h3>
              <p>{status(c.stage)}</p>
              <p>{c.customerSummary}</p>
              {c.publicArrangement && (
                <p>
                  {t[25]}: {c.publicArrangement} {date(c.scheduledAt)}
                </p>
              )}
              {c.quotes
                ?.filter((q: any) =>
                  ["sent", "accepted", "superseded", "withdrawn"].includes(q.status),
                )
                .map((q: any) => (
                  <section
                    key={q.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      padding: 20,
                      margin: "16px 0",
                    }}
                  >
                    <h4>
                      {q.title} · {t[24]} {q.revision} · {status(q.status)}
                    </h4>
                    {[
                      ["scope", 18],
                      ["included", 19],
                      ["excluded", 20],
                      ["terms", 21],
                    ].map(
                      ([field, label]) =>
                        q[field] && (
                          <p key={field}>
                            <strong>{t[Number(label)]}: </strong>
                            {q[field]}
                          </p>
                        ),
                    )}
                    <ul>
                      {q.lines?.map((l: QuoteLineView, i: number) => (
                        <li key={l.lineId ?? i}>
                          {l.label} × {l.quantity} ·{" "}
                          {new Intl.NumberFormat(locale, {
                            style: "currency",
                            currency: q.currency,
                          }).format(l.unitMinor / 100)}
                          {l.lineId && (
                            <p>
                              {locale === "zh" ? "实际服务方" : "Service provider"} ·{" "}
                              {l.serviceName}
                              <br />
                              {locale === "zh" ? "签约方" : "Contracting party"} · {l.contractName}
                              <br />
                              {locale === "zh" ? "收款方" : "Payee"} · {l.payeeName}
                            </p>
                          )}
                          {(l.collectionNotice || l.customerNotice) && (
                            <p className="quote-notice">{l.collectionNotice || l.customerNotice}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p>
                      <strong>
                        {t[22]}:{" "}
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: q.currency,
                        }).format(q.totalMinor / 100)}
                      </strong>
                    </p>
                    <p>
                      {t[23]}: {quoteTimeLabel(q.expiresAt, locale)}
                    </p>
                    {q.status === "sent" &&
                      Number(c.latestQuote) === Number(q.id) &&
                      Date.parse(q.expiresAt) > Date.now() && (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!agree[q.id]}
                              onChange={(e) => setAgree({ ...agree, [q.id]: e.target.checked })}
                            />
                            {t[26]}
                          </label>
                          <button disabled={busy || !agree[q.id]} onClick={() => confirm(q)}>
                            {busy ? t[14] : t[13]}
                          </button>
                        </>
                      )}
                  </section>
                ))}
            </article>
          ))}
          {data.conversations?.length > 0 && (
            <>
              <h2>{t[16]}</h2>
              {data.conversations.map((c: any) => (
                <section key={c.id}>
                  {c.messages.map((m: any) => (
                    <p key={m.id}>{m.text}</p>
                  ))}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
