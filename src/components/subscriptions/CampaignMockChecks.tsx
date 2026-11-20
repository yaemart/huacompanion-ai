"use client";

import { useState, type FormEvent } from "react";
import type { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
type Status = Awaited<ReturnType<typeof campaignMockChecks>>;
type Draft = { campaignKey: string; revision: number };
export function CampaignMockChecks({
  draft,
  status,
  dirty,
  disabled,
  onBusyChange,
}: {
  draft: Draft;
  status: Status;
  dirty: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = dirty || disabled || !status.enabled || !status.current || busy;
  async function submit(event: FormEvent<HTMLFormElement>, action: "mock-test" | "mock-confirm") {
    event.preventDefault();
    const readable = new FormData(event.currentTarget).getAll("readable");
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const response = await fetch("/api/subscriptions/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          input: {
            campaignKey: draft.campaignKey,
            revision: draft.revision,
            ...(action === "mock-confirm" ? { testId: status.testId, readable } : {}),
          },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "模拟操作未完成，请重新打开草稿后重试。");
        setBusy(false);
        onBusyChange?.(false);
        return;
      }
      window.location.assign(
        "/subscription-campaigns?campaign=" + encodeURIComponent(draft.campaignKey),
      );
    } catch {
      setError("模拟操作未完成或条件已变化，请保存修改并重新打开草稿后重试。");
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <section aria-label="本地模拟测试与确认">
      <h2>本地模拟测试与确认</h2>
      <p>
        仅生成虚构收件人的模拟邮件，未实际发送，也不代表真实发件获准。退订凭证随后续逐人发送接入。
      </p>
      {error && <p role="alert">{error}</p>}
      {dirty && <p role="status">请先保存修改，再生成模拟邮件或确认。</p>}
      {!status.enabled && <p>仅支持本地模拟，真实测试与发送尚未开放。</p>}
      {!status.current && <p>来源已变化，请重新选择政策并保存，再测试。</p>}
      <form onSubmit={(event) => submit(event, "mock-test")}>
        <button className="button" disabled={blocked}>
          生成本地模拟邮件
        </button>
      </form>
      {!status.tested && <p>尚无有效模拟测试。草稿、来源、授权或发件配置变化后须重新测试。</p>}
      {status.messages.map((message) => (
        <details key={message.locale} open>
          <summary>{message.locale === "zh" ? "中文" : "英文"}模拟邮件（未实际发送）</summary>
          <p>模拟收件人：{message.to}</p>
          <h3>{message.subject}</h3>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</p>
        </details>
      ))}
      <form onSubmit={(event) => submit(event, "mock-confirm")}>
        <fieldset disabled={blocked || !status.tested || status.mockConfirmed}>
          <legend>逐语言确认可读</legend>
          {status.messages.map((message) => (
            <label key={message.locale} style={{ display: "block", padding: "12px 0" }}>
              <input
                type="checkbox"
                name="readable"
                value={message.locale}
                defaultChecked={status.mockConfirmed}
                required
              />{" "}
              确认
              {message.locale === "zh" ? "中文" : "英文"}模拟邮件可读
            </label>
          ))}
          <button className="button" disabled={status.mockConfirmed}>
            记录本地模拟确认
          </button>
        </fieldset>
      </form>
      {status.mockConfirmed && !dirty && (
        <p role="status">已完成本地模拟确认，未发送邮件；收件资格冻结与发送仍未启用。</p>
      )}
    </section>
  );
}
