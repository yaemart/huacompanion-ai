"use client";

import { useState, type FormEvent } from "react";
import { staffDateTime } from "@/lib/staff-display";
import type { readCampaignFreeze } from "@/server/subscription-campaign-freeze";
import type { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
type Status = Awaited<ReturnType<typeof campaignMockChecks>>;
type Draft = { campaignKey: string; revision: number };
export function CampaignMockChecks({
  draft,
  status,
  frozen,
  dirty,
  disabled,
  onBusyChange,
}: {
  draft: Draft;
  status: Status;
  frozen?: Awaited<ReturnType<typeof readCampaignFreeze>>;
  dirty: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = dirty || disabled || !status.enabled || !status.current || busy;
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: "mock-test" | "mock-confirm" | "freeze-local",
  ) {
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
          <div lang={message.locale}>
            <h3>{message.subject}</h3>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</p>
          </div>
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
      {status.mockConfirmed && !dirty && <p role="status">已完成本地模拟确认，未发送邮件。</p>}
      <h3>收件名单快照（仅本地暂存）</h3>
      {frozen ? (
        <div role="status">
          <p>
            第 {frozen.revision} 版快照 · 编号 {frozen.id} · 全部暂存，未发送
          </p>
          <p>
            中文 {frozen.counts.zh} 人，英文 {frozen.counts.en} 人。冻结于{" "}
            {staffDateTime(frozen.frozenAt)}（北京时间）。
          </p>
          {dirty && <p>当前选择未保存，下方历史快照不会因此改变。</p>}
          {!frozen.current && <p>这是旧版快照；改版续发尚未开放，原快照已保留。</p>}
          <p>冻结后新增的订阅者不补入本轮；发送前仍须重新核验资格和额度。</p>
        </div>
      ) : (
        <form onSubmit={(event) => submit(event, "freeze-local")}>
          {!status.mockConfirmed && <p>请先生成模拟邮件并逐语言确认可读，再冻结本轮名单。</p>}
          <p>按点击时的当前资格冻结，最多 1,000 人；保存暂存任务，不发送邮件。</p>
          <button className="button" disabled={blocked || !status.mockConfirmed}>
            冻结本轮名单（不发送）
          </button>
        </form>
      )}
    </section>
  );
}
