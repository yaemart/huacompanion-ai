"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  configurableMetric,
  pointsForExample,
  scorecardMetricKeys,
  scorecardMetrics,
  scorecardTemplateKeys,
  scorecardTemplates,
  type MetricRule,
  type ScorecardMetric,
  type ScorecardTemplate,
} from "@/lib/staff-scorecard";
import type { readScorecardSettings } from "@/server/performance/scorecard-settings";

type Settings = Awaited<ReturnType<typeof readScorecardSettings>>;
const fields = {
  weight: "权重（%）",
  target: "达标值",
  zero: "零分界线",
  minimum: "最低样本",
} as const;
const ruleFields = Object.keys(fields) as (keyof MetricRule)[];

export function ScorecardEditor({ initial, earliest }: { initial: Settings; earliest: string }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial.rules);
  const [revision, setRevision] = useState(initial.revision);
  const [renderedRules, setRenderedRules] = useState(JSON.stringify(initial.rules));
  const trialInput = useRef<HTMLInputElement>(null);
  const scheduleInput = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = renderedRules !== JSON.stringify(rules);
  const locked = initial.trialLocked;

  const updateMetric = (
    t: ScorecardTemplate,
    key: ScorecardMetric,
    field: keyof MetricRule,
    value: number,
  ) =>
    setRules((prior) => ({
      ...prior,
      templates: {
        ...prior.templates,
        [t]: { ...prior.templates[t], [key]: { ...prior.templates[t][key], [field]: value } },
      },
    }));
  const updatePerson = (id: number, template: ScorecardTemplate | "") =>
    setRules((prior) => {
      const assignments = { ...prior.assignments };
      if (template) assignments[id] = template;
      else delete assignments[id];
      return { ...prior, assignments };
    });

  async function submit(action: "save" | "schedule") {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const submittedRules = { ...rules, trialStart: trialInput.current?.value || null };
      const month = locked ? scheduleInput.current?.value : submittedRules.trialStart;
      if (action === "schedule" && JSON.stringify(submittedRules) !== renderedRules)
        throw Error("先保存草稿，再安排未来月份。");
      const response = await fetch("/api/scorecard-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision,
          reason,
          ...(action === "save" ? { rules: submittedRules } : { month }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(String(result.error || "操作未完成，请保留当前输入后重试。"));
      setRevision(result.revision);
      setRules(submittedRules);
      setRenderedRules(JSON.stringify(submittedRules));
      setReason("");
      setMessage(action === "save" ? "评分规则草稿已保存。" : "观察规则已安排。");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作未完成，请刷新后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="performance-desk scorecard">
      <nav>
        <a href="/performance-center/monthly">返回个人业绩与月报</a>
      </nav>
      <h1>评分规则</h1>
      <p>
        前三个完整北京时间自然月为试行期，只记录指标、样本和复核结果。试行结束后仍保持记录模式。
      </p>
      <fieldset disabled={busy}>
        <label htmlFor="trial-start">试行开始月（北京时间）</label>
        <input
          id="trial-start"
          ref={trialInput}
          type="month"
          min={locked ? undefined : earliest}
          readOnly={locked}
          defaultValue={rules.trialStart ?? ""}
          onChange={(event) =>
            setRules({ ...rules, trialStart: event.currentTarget.value || null })
          }
        />
        {locked && <p>试行开始月已锁定。</p>}
        <h2>职责模板</h2>
        <p>
          计分权重合计须为 100%。兼岗模板合计为 100%
          后可分配给员工。内容计划发布和审核退回率保留为观察项。
        </p>
        {scorecardTemplateKeys.map((template) => (
          <details key={template}>
            <summary>
              {scorecardTemplates[template]} ·{" "}
              {Object.values(rules.templates[template]).reduce(
                (sum, row) => sum + (row.weight || 0),
                0,
              )}
              %
            </summary>
            <RuleTable
              template={template}
              rules={rules.templates[template]}
              onChange={updateMetric}
            />
          </details>
        ))}
        <h2>员工适用模板</h2>
        <p>安排后，本月份使用对应的规则和名单。可以给兼岗人员单独选择兼岗模板。</p>
        <div className="scorecard-assignments">
          {initial.people.map(({ id, name, active }) => (
            <div key={id}>
              <label htmlFor={`staff-${id}`}>
                {name}
                {active === false ? "（已停用）" : ""}
              </label>
              <select
                id={`staff-${id}`}
                value={rules.assignments[id] ?? ""}
                onChange={(event) =>
                  updatePerson(id, event.currentTarget.value as ScorecardTemplate | "")
                }
              >
                <option value="">未分配</option>
                {scorecardTemplateKeys.map((key) => (
                  <option key={key} value={key}>
                    {scorecardTemplates[key]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <label htmlFor="scorecard-reason">调整原因</label>
        <textarea
          id="scorecard-reason"
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
        <div className="scorecard-actions">
          <button type="button" onClick={() => void submit("save")}>
            保存草稿
          </button>
          <div>
            <label htmlFor="scorecard-effective">安排月份（北京时间）</label>
            <input
              id="scorecard-effective"
              key={locked ? "upcoming" : rules.trialStart}
              ref={scheduleInput}
              type="month"
              min={earliest}
              defaultValue={locked ? earliest : (rules.trialStart ?? earliest)}
              readOnly={!locked}
            />
          </div>
          <button
            type="button"
            disabled={dirty || !revision}
            onClick={() => void submit("schedule")}
          >
            安排观察规则
          </button>
        </div>
        {(dirty || !revision) && <p>先保存草稿，再安排未来月份。</p>}
      </fieldset>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <h2>已安排版本</h2>
      {initial.plans.length ? (
        <ul>
          {initial.plans.map((plan) => (
            <li key={plan.effectiveMonth}>
              {plan.effectiveMonth} · 版本 {plan.revision}
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无已安排规则。</p>
      )}
    </main>
  );
}

function RuleTable({
  template,
  rules,
  onChange,
}: {
  template: ScorecardTemplate;
  rules: Settings["rules"]["templates"][ScorecardTemplate];
  onChange: (
    template: ScorecardTemplate,
    key: ScorecardMetric,
    field: keyof MetricRule,
    value: number,
  ) => void;
}) {
  const keys = scorecardMetricKeys.filter((key) => key !== "quality" || template === "combined");
  return (
    <div
      className="scorecard-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={scorecardTemplates[template] + "模板设置"}
    >
      <table className="scorecard-table">
        <thead>
          <tr>
            <th scope="col">指标</th>
            {ruleFields.map((field) => (
              <th key={field} scope="col">
                {fields[field]}
              </th>
            ))}
            <th scope="col">假设值换算示例</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const rule = rules[key];
            const { label, unit } = scorecardMetrics[key];
            const average = (rule.target + rule.zero) / 2;
            const middle = unit === "件" || unit === "项" ? Math.round(average) : average;
            const preview = pointsForExample(key, rule, middle);
            return (
              <tr key={key}>
                <th scope="row">
                  {label}（{unit}）
                </th>
                {ruleFields.map((field) => (
                  <td key={field}>
                    <input
                      type="number"
                      min={field === "minimum" ? 1 : 0}
                      step={field === "weight" || field === "minimum" ? 1 : "any"}
                      aria-label={label + " " + fields[field]}
                      value={Number.isFinite(rule[field]) ? rule[field] : ""}
                      disabled={!configurableMetric(template, key)}
                      onChange={(event) =>
                        onChange(template, key, field, event.currentTarget.valueAsNumber)
                      }
                    />
                  </td>
                ))}
                <td>
                  {rule.weight > 0 && Number.isFinite(preview)
                    ? `假设 ${middle}，对应 ${preview.toFixed(1)} 分`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
