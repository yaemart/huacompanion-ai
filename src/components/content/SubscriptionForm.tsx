"use client";

import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

const copy = {
  en: {
    title: "Email updates",
    email: "Email address",
    topic: "Topic",
    choose: "Choose a topic",
    agree: "I agree to receive emails about the selected topic.",
    privacy: "Privacy notice",
    submit: "Request subscription",
    sending: "Submitting…",
    received:
      "Request received. If a confirmation email arrives, follow its link to complete your subscription.",
    invalid: "Check your email address and topic, then refresh the page if the form has changed.",
    limited: "Too many requests. Please wait a few minutes and try again.",
    unavailable: "The form is temporarily unavailable. Please try again later.",
    script: "Enable JavaScript in your browser to submit this form.",
  },
  zh: {
    title: "邮件订阅",
    email: "邮箱地址",
    topic: "订阅主题",
    choose: "选择一个主题",
    agree: "我同意接收所选主题的邮件。",
    privacy: "隐私说明",
    submit: "申请订阅",
    sending: "正在提交…",
    received: "已收到申请。如收到确认邮件，请点击邮件内的链接完成订阅。",
    invalid: "请检查邮箱和主题。如果表单已更新，请刷新后再试。",
    limited: "提交过于频繁，请稍等几分钟再试。",
    unavailable: "订阅暂不可用，请稍后再试。",
    script: "请在浏览器中启用 JavaScript 后提交。",
  },
};
type Status = "idle" | "sending" | "received" | "invalid" | "limited" | "unavailable";
const subscribe = () => () => {};

export function SubscriptionForm({
  locale,
  sourcePath,
  privacyVersion,
  topics,
  preset,
}: {
  locale: keyof typeof copy;
  sourcePath: string;
  privacyVersion: string;
  topics: { value: string; label: string }[];
  preset: string;
}) {
  const text = copy[locale];
  const heading = useId();
  const busy = useRef(false);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [status, setStatus] = useState<Status>("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (busy.current || fields.get("consent") !== "yes") return;
    busy.current = true;
    setStatus("sending");
    try {
      const response = await fetch("/api/subscriptions/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          topic: fields.get("topic"),
          contactFax: fields.get("contactFax"),
          consent: true,
          privacyVersion,
          sourcePath,
          locale,
        }),
      });
      if (response.status === 202) {
        setStatus("received");
        return;
      }
      setStatus(
        response.status === 400 ? "invalid" : response.status === 429 ? "limited" : "unavailable",
      );
    } catch {
      setStatus("unavailable");
    }
    busy.current = false;
  }
  return (
    <section className="subscription-panel" aria-labelledby={heading}>
      <h2 id={heading}>{text.title}</h2>
      {status !== "received" && (
        <form
          className="subscription-form"
          method="post"
          action="/api/subscriptions/request"
          onSubmit={submit}
        >
          <label className="subscription-field">
            {text.email}
            <input
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              maxLength={254}
              required
            />
          </label>
          <label className="subscription-field">
            {text.topic}
            <select name="topic" required defaultValue={preset}>
              <option value="" disabled>
                {text.choose}
              </option>
              {topics.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div hidden aria-hidden="true">
            <input
              name="contactFax"
              type="text"
              autoComplete="off"
              tabIndex={-1}
              aria-label="Fax"
            />
          </div>
          <div className="subscription-consent">
            <label>
              <input type="checkbox" name="consent" value="yes" required />
              {text.agree}
            </label>
            <a href={`/${locale}/privacy`}>{text.privacy}</a>
          </div>
          <button className="button" type="submit" disabled={!ready || status === "sending"}>
            {status === "sending" ? text.sending : text.submit}
          </button>
        </form>
      )}
      <noscript>{text.script}</noscript>
      <p className="subscription-result" role="status">
        {status !== "idle" && status !== "sending" ? text[status] : ""}
      </p>
    </section>
  );
}
