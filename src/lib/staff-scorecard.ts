export const scorecardTemplates = {
  operations: "运营",
  editor: "内容编辑",
  reviewer: "审核人",
  combined: "兼岗",
} as const;
export const scorecardObservationLabels = {
  missing: "缺少计划数据",
  monitor: "只记录",
  pending: "待定",
  eligible: "样本满足",
  insufficient: "样本不足",
  unassigned: "无已分配且到期的复核任务",
};
export const scorecardReviewLabels = {
  upheld: "维持判定",
  changed: "调整归属",
  dismissed: "撤销判定",
};
export type ScorecardTemplate = keyof typeof scorecardTemplates;

const definitions = {
  response: {
    label: "首次响应时长中位数",
    unit: "分钟",
    higher: false,
    target: 1440,
    zero: 2880,
    minimum: 5,
  },
  followup: { label: "按时跟进率", unit: "%", higher: true, target: 90, zero: 60, minimum: 5 },
  complaints: {
    label: "个人有效投诉数",
    unit: "件",
    higher: false,
    target: 0,
    zero: 3,
    minimum: 5,
  },
  planned: { label: "内容按计划发布数", unit: "次", higher: true, target: 1, zero: 0, minimum: 1 },
  returnRate: { label: "审核退回率", unit: "%", higher: false, target: 0, zero: 100, minimum: 1 },
  corrections: {
    label: "个人发布后纠错次数",
    unit: "件",
    higher: false,
    target: 0,
    zero: 3,
    minimum: 5,
  },
  overdue: { label: "逾期复核待办数", unit: "项", higher: false, target: 0, zero: 3, minimum: 3 },
  reviewTime: {
    label: "审核处理时长中位数",
    unit: "分钟",
    higher: false,
    target: 1440,
    zero: 2880,
    minimum: 5,
  },
  quality: { label: "已确认质量事件数", unit: "件", higher: false, target: 0, zero: 3, minimum: 5 },
} as const;
export const scorecardMetrics = definitions;
export type ScorecardMetric = keyof typeof definitions;
export type MetricRule = { weight: number; target: number; zero: number; minimum: number };
export type MetricRules = Record<ScorecardMetric, MetricRule>;
export type ScorecardRules = {
  trialStart: string | null;
  templates: Record<ScorecardTemplate, MetricRules>;
  assignments: Record<string, ScorecardTemplate>;
};

export const scorecardTemplateKeys = Object.keys(scorecardTemplates) as ScorecardTemplate[];
export const scorecardMetricKeys = Object.keys(definitions) as ScorecardMetric[];
const weights: Record<ScorecardTemplate, Partial<Record<ScorecardMetric, number>>> = {
  operations: { response: 25, followup: 45, complaints: 30 },
  editor: { corrections: 60, overdue: 40 },
  reviewer: { corrections: 40, overdue: 30, reviewTime: 30 },
  combined: {},
};

export function defaultScorecardRules(): ScorecardRules {
  const templates = Object.fromEntries(
    scorecardTemplateKeys.map((template) => [
      template,
      Object.fromEntries(
        scorecardMetricKeys.map((key) => {
          const { target, zero, minimum } = definitions[key];
          return [key, { weight: weights[template][key] ?? 0, target, zero, minimum }];
        }),
      ),
    ]),
  ) as ScorecardRules["templates"];
  return { trialStart: null, templates, assignments: {} };
}

export function scorecardMonth(value: unknown): value is string {
  return typeof value === "string" && /^20\d\d-(0[1-9]|1[0-2])$/.test(value);
}

export function observationMode(month: string, trialStart: string | null) {
  if (!trialStart || month < trialStart) return "unconfigured" as const;
  const end = new Date(trialStart + "-01T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() + 3);
  return month < end.toISOString().slice(0, 7) ? ("trial" as const) : ("recording" as const);
}

export function configurableMetric(template: ScorecardTemplate, key: ScorecardMetric) {
  if (key === "planned" || key === "returnRate") return false;
  if (template === "combined") return key !== "complaints" && key !== "corrections";
  return key !== "quality";
}

function checkedObject(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (keys && Object.keys(value).some((key) => !keys.includes(key)))
  )
    throw new Error("评分配置格式有误，请检查后重试。");
  return value as Record<string, unknown>;
}

export function validateScorecardRules(input: unknown): ScorecardRules {
  const value = checkedObject(input, ["trialStart", "templates", "assignments"]);
  const trialStart = value.trialStart;
  if (trialStart !== null && !scorecardMonth(trialStart)) throw Error("请选择有效的试行开始月。");
  const result = defaultScorecardRules();
  result.trialStart = trialStart;
  const templates = checkedObject(value.templates, scorecardTemplateKeys);
  for (const template of scorecardTemplateKeys) {
    const rows = checkedObject(templates[template], scorecardMetricKeys);
    for (const key of scorecardMetricKeys) {
      const row = checkedObject(rows[key], ["weight", "target", "zero", "minimum"]);
      const { weight, target, zero, minimum } = row;
      const metric = definitions[key];
      const max = metric.unit === "%" ? 100 : 1000000;
      if (
        typeof weight !== "number" ||
        !Number.isInteger(weight) ||
        weight < 0 ||
        weight > 100 ||
        typeof target !== "number" ||
        !Number.isFinite(target) ||
        target < 0 ||
        target > max ||
        typeof zero !== "number" ||
        !Number.isFinite(zero) ||
        zero < 0 ||
        zero > max ||
        typeof minimum !== "number" ||
        !Number.isInteger(minimum) ||
        minimum < 1 ||
        minimum > 10000
      )
        throw Error(`${metric.label}的权重、目标或最低样本超出有效范围。`);
      if (
        (metric.unit === "件" || metric.unit === "项") &&
        (!Number.isInteger(target) || !Number.isInteger(zero))
      )
        throw Error(`${metric.label}的目标和零分界线须填整数。`);
      if (metric.higher ? target <= zero : target >= zero)
        throw Error(`请核对${metric.label}的达标值和零分界线。`);
      if (weight > 0 && !configurableMetric(template, key))
        throw Error(`${scorecardTemplates[template]}的${metric.label}只用于记录，权重请填 0。`);
      result.templates[template][key] = { weight, target, zero, minimum };
    }
    const rules = result.templates[template];
    const total = scorecardMetricKeys.reduce((sum, key) => sum + rules[key].weight, 0);
    if (total !== 100 && (template !== "combined" || total !== 0))
      throw Error(`${scorecardTemplates[template]}的权重合计须为 100%。`);
    if (rules.complaints.weight && rules.corrections.weight)
      throw Error("同时负责投诉与纠错的员工请使用兼岗模板的质量事件项。");
  }

  const assignments = checkedObject(value.assignments);
  if (Object.keys(assignments).length > 10000) throw Error("配置的员工数量过多。");
  for (const [id, template] of Object.entries(assignments)) {
    if (
      !/^[1-9]\d*$/.test(id) ||
      Number(id) > 2147483647 ||
      !scorecardTemplateKeys.includes(template as ScorecardTemplate)
    )
      throw Error("请选择有效的员工和职责模板。");
    if (
      template === "combined" &&
      !Object.values(result.templates.combined).some((metric) => metric.weight > 0)
    )
      throw Error("请先将兼岗模板的权重配置为 100%，再分配给员工。");
    result.assignments[id] = template as ScorecardTemplate;
  }
  return result;
}

type Evidence = { value: number | null; samples: number | null; pending?: number };
const negativeCount = new Set<ScorecardMetric>(["complaints", "corrections", "overdue", "quality"]);

export function observeMetric(key: ScorecardMetric, rule: MetricRule, evidence: Evidence) {
  const { value, samples, pending = 0 } = evidence;
  let status: "missing" | "monitor" | "pending" | "eligible" | "insufficient" | "unassigned";
  if (key === "planned") status = "missing";
  else if (pending) status = "pending";
  else if (rule.weight === 0) status = "monitor";
  else if (key === "overdue" && value === 0 && samples === 0) status = "unassigned";
  else if (
    value !== null &&
    ((samples ?? 0) >= rule.minimum || (negativeCount.has(key) && value > 0))
  )
    status = "eligible";
  else status = "insufficient";
  return { key, status, value, samples, pending, rule };
}

export function pointsForExample(key: ScorecardMetric, rule: MetricRule, value: number) {
  const direction = definitions[key].higher ? 1 : -1;
  const fraction = ((value - rule.zero) * direction) / ((rule.target - rule.zero) * direction);
  return Math.min(1, Math.max(0, fraction)) * rule.weight;
}
