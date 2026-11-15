"use client";
import "./performance.css";
import { useEffect, useState } from "react";
import type { performanceRead } from "../../server/performance/service";
import { dutyLabels, factIssueLabels, type IncidentSource } from "../../lib/performance-incidents";
import { readStaffFormResponse, staffFormMessage } from "../../lib/staff-form-feedback";
import { DecisionForm, AppealReview, submit } from "./ReviewForms";

export type PerformanceData = Awaited<ReturnType<typeof performanceRead>>;
export type ReviewRow = PerformanceData["queue"][number];
export type IncidentAction = (command: Record<string, unknown>) => Promise<void>;
type Target = { source: IncidentSource; record: number };
const base = "/api/performance-incidents";
const fallback = "操作未得到确认，当前填写可保留。请稍后重试。";
const states = { pending: "待确认或复核", confirmed: "已确认", dismissed: "不成立或已撤销" };
export const sourceLabel = (source: IncidentSource) =>
  source === "case" ? "服务投诉" : "发布后纠错";
const time = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});
export const displayTime = (value: string) => time.format(new Date(value));

function sourceHref(row: Pick<ReviewRow, "source" | "sourceRecord" | "sourceLocale">) {
  if (row.source === "case") return `/business-center?id=${row.sourceRecord}`;
  if (row.source === "content") return `/content-center?id=${row.sourceRecord}`;
  const locale =
    row.source === "note" && (row.sourceLocale === "en" || row.sourceLocale === "zh")
      ? `&locale=${row.sourceLocale}`
      : "";
  return `/content-center/policy-facts?id=${row.sourceRecord}${locale}`;
}

export function PerformanceDesk({ target, id }: { target?: Target; id?: number }) {
  const [data, setData] = useState<PerformanceData>();
  const [sources, setSources] = useState<{ id: number; label: string }[]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<number | undefined>(id);
  const load = async () =>
    readStaffFormResponse<PerformanceData>(
      await fetch(base + (focused ? `?id=${focused}` : ""), { cache: "no-store" }),
      "暂时无法读取记录，请刷新后再试。",
    );
  useEffect(() => {
    let live = true;
    load().then(
      (result) => {
        if (live) setData(result);
      },
      (failure: unknown) => {
        if (live) setError(staffFormMessage(failure, fallback));
      },
    );
    return () => {
      live = false;
    };
  }, [focused]);
  useEffect(() => {
    if (!target) return;
    let live = true;
    fetch(`${base}?source=${target.source}&record=${target.record}`, { cache: "no-store" })
      .then((response) =>
        readStaffFormResponse<{ choices: { id: number; label: string }[] }>(response, fallback),
      )
      .then(({ choices }) => {
        if (live) setSources(choices);
      })
      .catch((failure: unknown) => {
        if (live) setError(staffFormMessage(failure, fallback));
      });
    return () => {
      live = false;
    };
  }, [target]);
  const act: IncidentAction = async (command) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await readStaffFormResponse<{ id: number; duplicate?: boolean }>(
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        fallback,
      );
      if (!Number.isSafeInteger(result.id) || result.id < 1) throw Error(fallback);
      if (command.action === "register") {
        setFocused(result.id);
        setSources(undefined);
      } else await load().then(setData);
      setMessage(result.duplicate ? "这项操作已经保存。" : "已保存。");
    } catch (failure) {
      setError(staffFormMessage(failure, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="performance-desk">
      <nav>
        <a href="/admin">管理后台</a> · <a href="/workflow-center">站内通知</a> ·{" "}
        <a href="/performance-center">全部记录</a> ·{" "}
        <a href="/performance-center/monthly">个人业绩与月报</a>
      </nav>
      <h1>投诉、纠错与申诉</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {target && sources && (
        <article>
          <h2>登记{sourceLabel(target.source)}</h2>
          {sources.length ? (
            <form
              onSubmit={(event) =>
                submit(
                  event,
                  (form) =>
                    void act({
                      action: "register",
                      source: target.source,
                      sourceRecord: target.record,
                      sourceVersion: form.get("version"),
                      issueField: form.get("issueField"),
                      occurredAt: form.get("occurredAt"),
                      title: form.get("title"),
                      evidence: form.get("evidence"),
                      relatedIncident: form.get("relatedIncident"),
                    }),
                )
              }
            >
              <fieldset disabled={busy}>
                <label>
                  {target.source === "case" ? "关联服务单" : "发生错误的正式版本"}
                  <select
                    name="version"
                    defaultValue={sources.length === 1 ? sources[0].id : ""}
                    required
                  >
                    <option value="">请选择</option>
                    {sources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {target.source === "fact" && (
                  <label>
                    问题涉及的字段
                    <select name="issueField" required defaultValue="">
                      <option value="">请选择</option>
                      {Object.entries(factIssueLabels).map(([key, text]) => (
                        <option key={key} value={key}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {target.source === "case" && (
                  <label>
                    发生时间（北京时间）
                    <input name="occurredAt" type="datetime-local" step="1" required />
                  </label>
                )}
                <label>
                  问题简称
                  <input name="title" maxLength={200} required />
                </label>
                <label>
                  内部事实和凭据
                  <textarea name="evidence" rows={4} maxLength={4000} required />
                </label>
                <p>请写明发生经过和可核对的记录位置，资料原文留在原服务单或内容记录中。</p>
                <label>
                  关联投诉或纠错的编号（可选）
                  <input name="relatedIncident" type="number" min={1} />
                </label>
                <button>登记{sourceLabel(target.source)}</button>
              </fieldset>
            </form>
          ) : (
            <p>没有可选的正式版本。</p>
          )}
        </article>
      )}
      {!target && !focused && <p>请从服务单或正式内容的原页面进入登记。</p>}
      {data && (
        <>
          <section aria-label="我的判定">
            <h2>我的判定</h2>
            {!data.personal.length && <p>暂无判定。</p>}
            {data.personal.map(({ id: record, source, state, finding }) => (
              <article key={record}>
                <h3>
                  {sourceLabel(source)} #{record} · {dutyLabels[finding.duty]}
                </h3>
                <p>{states[state]}</p>
                <p>{finding.summary}</p>
                {finding.resolution && <p>复核结果：{finding.resolution}</p>}
                {!finding.active && <p>本人的原归属已撤销或调整。</p>}
                {finding.appealAt && (
                  <p>
                    申诉：{finding.appealReason} · {finding.resolvedAt ? "已处理" : "待复核"}
                  </p>
                )}
                {finding.canAppeal && (
                  <form
                    onSubmit={(event) =>
                      submit(
                        event,
                        (form) =>
                          void act({ action: "appeal", id: record, reason: form.get("reason") }),
                      )
                    }
                  >
                    <fieldset disabled={busy}>
                      <p>请在 {displayTime(finding.appealClosesAt)}（北京时间）前提交。</p>
                      <label>
                        申诉理由
                        <textarea name="reason" required maxLength={2000} />
                      </label>
                      <button>申请复核</button>
                    </fieldset>
                  </form>
                )}
              </article>
            ))}
          </section>
          <section aria-label="我的登记">
            <h2>我的登记</h2>
            {!data.reports.length && <p>暂无登记。</p>}
            {data.reports.map((record) => (
              <article key={record.id}>
                <h3>
                  {sourceLabel(record.source)} #{record.id} · {states[record.state]}
                </h3>
                {!!record.title && <p>{record.title}</p>}
                {record.canSupplement && (
                  <form
                    onSubmit={(event) =>
                      submit(
                        event,
                        (form) =>
                          void act({
                            action: "supplement",
                            id: record.id,
                            evidence: form.get("evidence"),
                          }),
                      )
                    }
                  >
                    <fieldset disabled={busy}>
                      <label>
                        补充凭据
                        <textarea name="evidence" maxLength={2000} required />
                      </label>
                      <button>补充记录</button>
                    </fieldset>
                  </form>
                )}
              </article>
            ))}
          </section>
          {!!data.reviewed.length && (
            <section aria-label="我审核过的版本纠错">
              <h2>我审核过的版本纠错</h2>
              {data.reviewed.map((row) => (
                <p key={row.id}>
                  纠错 #{row.id} · 已确认 · 正式第 {row.sourceRevision} 版 ·{" "}
                  <a href={sourceHref(row)}>查看关联内容</a>
                </p>
              ))}
            </section>
          )}
          {!!data.queue.length && (
            <section aria-label="权限内的判定与复核">
              <h2>权限内的判定与复核</h2>
              {data.queue.map((row) => (
                <article key={row.id}>
                  <h3>
                    {sourceLabel(row.source)} #{row.id} · {row.title}
                  </h3>
                  <p>
                    {states[row.state]} · {displayTime(row.occurredAt)}（北京时间） ·{" "}
                    <a href={sourceHref(row)}>打开原记录</a>
                  </p>
                  <p className="performance-evidence">{row.evidence}</p>
                  {row.sourceRevision && <p>发生错误的正式版本：第 {row.sourceRevision} 版</p>}
                  {row.relatedIncident && (
                    <p>
                      <a href={`/performance-center?id=${row.relatedIncident}`}>
                        查看关联记录 #{row.relatedIncident}
                      </a>
                    </p>
                  )}
                  {row.duplicateOf && (
                    <p>
                      <a href={`/performance-center?id=${row.duplicateOf}`}>
                        查看原登记 #{row.duplicateOf}
                      </a>
                    </p>
                  )}
                  {row.decisionReason && <p>判定依据：{row.decisionReason}</p>}
                  {row.canDecide && <DecisionForm row={row} busy={busy} act={act} />}
                  {row.findings.map((finding) => (
                    <section key={finding.id} aria-label="个人归属">
                      <p>
                        {row.people.find(({ id: staff }) => staff === finding.staff)?.name ||
                          "历史员工"}{" "}
                        · {dutyLabels[finding.duty]} · {finding.summary}
                      </p>
                      {finding.resolution && <p>复核结果：{finding.resolution}</p>}
                      {finding.appealAt && !finding.resolvedAt && (
                        <>
                          <p>申诉理由：{finding.appealReason}</p>
                          {row.canResolve ? (
                            <AppealReview row={row} finding={finding.id} busy={busy} act={act} />
                          ) : (
                            <p>请由另一位有权限且未涉事的人员复核。</p>
                          )}
                        </>
                      )}
                    </section>
                  ))}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
