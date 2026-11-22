"use client";

import { useState, type FormEvent } from "react";
import { staffDate, staffDateTime } from "@/lib/staff-display";
import type { readCampaignWorkspace } from "@/server/subscription-campaign-workspace";
import type { readCampaignDraft } from "@/server/subscription-campaign-drafts";
import { CampaignMockChecks } from "./CampaignMockChecks";
import type { readCampaignFreeze } from "@/server/subscription-campaign-freeze";
import type { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
import type { readCampaignPause } from "@/server/subscription-campaign-control";
import { CampaignPauseControls } from "./CampaignPauseControls";
import { CampaignTaskStatus } from "./CampaignTaskStatus";
import type { readCampaignTaskStatus } from "@/server/subscription-campaign-status";
import { CampaignTaskPlayground } from "./CampaignTaskPlayground";

type Workspace = Awaited<ReturnType<typeof readCampaignWorkspace>>;
type Draft = Awaited<ReturnType<typeof readCampaignDraft>>;
export function CampaignWorkspace({
  workspace,
  draft,
  saved,
  checks,
  frozen,
  pause,
  taskStatus,
  taskSlots,
}: {
  workspace: Workspace;
  draft?: Draft;
  saved?: boolean;
  checks?: Awaited<ReturnType<typeof campaignMockChecks>>;
  frozen?: Awaited<ReturnType<typeof readCampaignFreeze>>;
  pause?: Awaited<ReturnType<typeof readCampaignPause>>;
  taskStatus?: Awaited<ReturnType<typeof readCampaignTaskStatus>>;
  taskSlots?: number[];
}) {
  const [busy, setBusy] = useState(false);
  const [checkBusy, setMockBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [control, setControl] = useState(pause);
  const [controlUncertain, setControlUncertain] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskUncertain, setTaskUncertain] = useState(false);
  const taskBlocked = taskBusy || taskUncertain;
  const mockBusy = checkBusy || taskBlocked;
  async function submit(event: FormEvent<HTMLFormElement>, action: "grant" | "save") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const input =
        action === "grant"
          ? {
              staffId: Number(form.get("staffId")),
              topic: "policy-updates",
              enabled: form.get("enabled") === "true",
            }
          : {
              ...(draft ? { campaignKey: draft.campaignKey, revision: draft.revision } : {}),
              policies: form.getAll("policy").map((value) => JSON.parse(String(value))),
            };
      const response = await fetch("/api/subscriptions/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input }),
      });
      const result = (await response.json()) as { error?: string; campaignKey?: string };
      if (!response.ok) throw new Error(result.error || "保存未完成，请保留当前填写后重试。");
      window.location.assign(
        "/subscription-campaigns?saved=1" +
          (result.campaignKey ? "&campaign=" + encodeURIComponent(result.campaignKey) : ""),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络暂时不可用，当前填写已保留。");
      setBusy(false);
    }
  }
  return (
    <main className="subscription-management">
      <a href="/admin">返回管理后台</a>
      <h1>政策群发草稿</h1>
      <p>仅本地模拟准备，保存不会发送邮件。主题：政策更新。</p>
      {saved && <p role="status">操作已保存。{draft && `当前为第 ${draft.revision} 版。`}</p>}
      {error && <p role="alert">{error}</p>}
      {workspace.grants && (
        <section aria-label="主题授权管理">
          <h2>主题授权管理</h2>
          <p>活动操作须单独授权，包括管理员本人；授权不会开放订阅邮箱名单。</p>
          <ul>
            {workspace.grants.map((who) => (
              <li key={who.staffId}>
                {who.name} · {who.enabled ? "已授权" : "未授权"}
                {!who.eligible && "（账号已停用或不再是主管，只能撤销）"}
              </li>
            ))}
          </ul>
          <form onSubmit={(event) => submit(event, "grant")} className="subscription-filters">
            <label>
              员工
              <select
                name="staffId"
                required
                defaultValue=""
                disabled={busy || mockBusy || controlBusy || controlUncertain}
              >
                <option value="" disabled>
                  请选择员工
                </option>
                {workspace.grants.map((who) => (
                  <option value={who.staffId} key={who.staffId}>
                    {who.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              主题权限
              <select
                name="enabled"
                defaultValue="true"
                disabled={busy || mockBusy || controlBusy || controlUncertain}
              >
                <option value="true">授予政策更新操作权</option>
                <option value="false">撤销政策更新操作权</option>
              </select>
            </label>
            <button
              className="button"
              disabled={busy || mockBusy || controlBusy || controlUncertain}
            >
              更新主题授权
            </button>
          </form>
        </section>
      )}
      {!workspace.canDraft ? (
        <p>当前账号尚未获活动操作授权，请先由管理员授权后重新打开本页。</p>
      ) : (
        <>
          <h2>我的活动草稿</h2>
          <a href="/subscription-campaigns">新建活动草稿</a>
          {!workspace.campaigns.length && <p>暂无草稿，勾选下方政策即可新建。</p>}
          <ul>
            {workspace.campaigns.map((item) => (
              <li key={item.campaignKey}>
                <a href={"/subscription-campaigns?campaign=" + item.campaignKey}>
                  政策更新 · {staffDateTime(item.updated)}（北京时间） · 第 {item.revision} 版
                </a>
              </li>
            ))}
          </ul>
          <h2>{draft ? `编辑草稿 · 第 ${draft.revision} 版` : "新建草稿"}</h2>
          {draft && checks && control && (
            <CampaignPauseControls
              draft={draft}
              control={control}
              dirty={dirty}
              canResume={checks.enabled && checks.current && checks.mockConfirmed}
              enabled={checks.enabled}
              disabled={busy || mockBusy}
              uncertain={controlUncertain}
              onUncertainChange={setControlUncertain}
              onChange={setControl}
              onBusyChange={setControlBusy}
            />
          )}
          {draft && !draft.current && (
            <p role="alert">
              来源已变化、下架或过期。
              {control?.cancelledAt
                ? "本活动已取消，下方保留的旧预览仅供查阅。"
                : "下方保留旧预览，请重新勾选当前资料并保存新版本。"}
            </p>
          )}
          <form onChange={() => setDirty(true)} onSubmit={(event) => submit(event, "save")}>
            <fieldset
              disabled={
                busy || mockBusy || controlBusy || controlUncertain || !!control?.cancelledAt
              }
            >
              <legend>选择已发布政策（最多 10 项）</legend>
              {!workspace.choices.length && <p>暂无可选政策，请先在政策工作台审核发布共用事实。</p>}
              {workspace.choices.map((choice) => (
                <label key={choice.key} style={{ display: "block", padding: "12px 0" }}>
                  <input
                    type="checkbox"
                    name="policy"
                    value={JSON.stringify(choice.policies)}
                    defaultChecked={draft?.policies.some(
                      (pair) => pair.zh === choice.policies.zh && pair.en === choice.policies.en,
                    )}
                  />{" "}
                  {choice.label}
                  <br />
                  核实：{staffDate(choice.verifiedOn)} · 截止：
                  {choice.until ? staffDate(choice.until) : "官方未注明"}
                </label>
              ))}
              <button className="button" disabled={!workspace.choices.length}>
                仅保存草稿并查看预览
              </button>
            </fieldset>
          </form>
          {draft && (
            <section aria-label="中英文预览">
              <h2>中英文预览</h2>
              <p>
                人数为预估：中文 {draft.counts.zh}，英文 {draft.counts.en}，缺语言资料排除{" "}
                {draft.counts.excluded}。统计截至 {staffDateTime(draft.asOf)}
                （北京时间），
                {control?.cancelledAt
                  ? "本活动已取消，以下资料仅供查阅。"
                  : "实际发送前仍须复查资格和额度。"}
              </p>
              {(["zh", "en"] as const).map((locale) => (
                <article lang={locale} key={locale}>
                  <h3>{locale === "zh" ? "中文" : "英文"}</h3>
                  {draft.preview[locale] ? (
                    <>
                      <h4>{draft.preview[locale].subject}</h4>
                      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {draft.preview[locale].body}
                      </p>
                    </>
                  ) : (
                    <p>该语言资料未齐备，对应订阅者将排除，不改用另一种语言。</p>
                  )}
                </article>
              ))}
            </section>
          )}
          {draft && checks && (
            <CampaignMockChecks
              draft={draft}
              status={checks}
              frozen={frozen}
              dirty={dirty}
              disabled={
                busy || taskBlocked || controlBusy || controlUncertain || !!control?.cancelledAt
              }
              paused={control?.paused}
              cancelled={!!control?.cancelledAt}
              onBusyChange={setMockBusy}
            />
          )}
          {draft && taskSlots && (
            <CampaignTaskPlayground
              draft={draft}
              slots={taskSlots}
              eligible={
                !!checks?.enabled &&
                checks.current &&
                checks.mockConfirmed &&
                !dirty &&
                !control?.paused &&
                !control?.cancelledAt
              }
              disabled={busy || checkBusy || controlBusy || controlUncertain}
              onBusyChange={setTaskBusy}
              onUncertainChange={setTaskUncertain}
            />
          )}
          {draft && taskStatus && (
            <CampaignTaskStatus
              draft={draft}
              initial={taskStatus}
              blocked={busy || mockBusy || controlBusy}
            />
          )}
        </>
      )}
    </main>
  );
}
