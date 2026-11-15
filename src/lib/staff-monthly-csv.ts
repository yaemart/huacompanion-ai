import type { readMonthlyPerformance } from "../server/performance/monthly";
import { csvDocument } from "./reporting.ts";
import {
  performanceIncidentLabels,
  performancePendingLabels,
} from "./staff-monthly-performance.ts";
import {
  scorecardMetrics,
  scorecardObservationLabels,
  scorecardReviewLabels,
  type ScorecardMetric,
} from "./staff-scorecard.ts";

type Report = Awaited<ReturnType<typeof readMonthlyPerformance>>;
type ExportReport = Pick<
  Report,
  "asOf" | "staff" | "name" | "response" | "followup" | "incidents" | "review" | "overdueReviews"
> & {
  period: Pick<Report["period"], "month">;
  pending: Readonly<Report["pending"]>;
  scorecard: Pick<
    NonNullable<Report["scorecard"]>,
    "mode" | "version" | "metrics" | "corrections"
  > | null;
};

export const monthlyCsvHeaders = [
  "月份",
  "统计截至时间（北京时间）",
  "员工编号",
  "员工姓名",
  "月报模式",
  "记录类型",
  "指标或类别",
  "状态",
  "实际值",
  "单位",
  "样本数",
  "分子",
  "分母",
  "达标值",
  "权重（%）",
  "最低样本",
  "规则版本",
  "记录编号",
  "复核时间（北京时间）",
];

function chinaTimestamp(value: string) {
  return new Date(Date.parse(value) + 8 * 3600000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "+08:00");
}

type CsvRow = {
  type: string;
  label: string;
  status: string;
  value?: number | null;
  unit?: string;
  samples?: number | null;
  numerator?: number;
  denominator?: number;
  target?: number;
  weight?: number;
  minimum?: number;
  record?: number;
  at?: string;
};

function monthlyRows(report: ExportReport): CsvRow[] {
  const { response, followup, review, incidents, overdueReviews, pending, scorecard } = report;
  const percent = (part: number, total: number) => (total ? (100 * part) / total : null);
  const observations = new Map(scorecard?.metrics?.map((item) => [item.key, item]));
  const keys: ScorecardMetric[] = [
    "response",
    "followup",
    "complaints",
    "planned",
    "returnRate",
    "corrections",
    "overdue",
    "reviewTime",
  ];
  if (observations.has("quality")) keys.push("quality");
  const actual = {
    response: { value: response.minutes, samples: response.samples },
    followup: {
      value: percent(followup.onTime, followup.due),
      samples: followup.due,
      numerator: followup.onTime,
      denominator: followup.due,
    },
    complaints: { value: incidents.complaints },
    planned: { value: null },
    returnRate: {
      value: percent(review.returned, review.decisions),
      samples: review.decisions,
      numerator: review.returned,
      denominator: review.decisions,
    },
    corrections: { value: incidents.corrections },
    overdue: { value: overdueReviews },
    reviewTime: { value: review.minutes, samples: review.samples },
    quality: { value: observations.get("quality")?.value ?? null },
  };
  const metrics = keys.map((key): CsvRow => {
    const { label, unit } = scorecardMetrics[key];
    const base = actual[key];
    const observation = observations.get(key);
    const rule = observation?.rule;
    const hasPending =
      (key === "complaints" || key === "corrections") &&
      pending.some(
        ({ source, reason }) =>
          reason !== "confirmation" && (source === "case") === (key === "complaints"),
      );
    let status = "已记录";
    if (observation) status = scorecardObservationLabels[observation.status];
    else if (key === "planned") status = "缺少计划数据";
    else if (hasPending) status = "待定";
    else if (base.value === null) status = "暂无样本";
    return {
      ...base,
      type: "月度指标",
      label,
      unit,
      status,
      ...(observation && { samples: observation.samples }),
      target: rule?.weight ? rule.target : undefined,
      weight: rule?.weight,
      minimum: rule?.weight ? rule.minimum : undefined,
    };
  });
  const pendingRows = pending.map(({ id, source, reason }): CsvRow => ({
    type: "待定记录",
    label: performanceIncidentLabels[source],
    status: performancePendingLabels[reason],
    record: id,
  }));
  const corrections =
    scorecard?.corrections?.map(({ id, result, at }): CsvRow => ({
      type: "复核更新",
      label: "申诉复核",
      status: scorecardReviewLabels[result],
      record: id,
      at: chinaTimestamp(at),
    })) ?? [];
  return [...metrics, ...pendingRows, ...corrections];
}

export function monthlyPerformanceCsv(reports: readonly ExportReport[]) {
  const rows = reports.flatMap((report) => {
    const mode =
      report.scorecard?.mode === "trial" ? "试行观察" : report.scorecard ? "观察记录" : "月报记录";
    const context = [
      report.period.month,
      chinaTimestamp(report.asOf),
      report.staff,
      report.name,
      mode,
    ];
    return monthlyRows(report).map((r) => [
      ...context,
      r.type,
      r.label,
      r.status,
      r.value,
      r.unit,
      r.samples,
      r.numerator,
      r.denominator,
      r.target,
      r.weight,
      r.minimum,
      report.scorecard?.version,
      r.record,
      r.at,
    ]);
  });
  return { csv: csvDocument(monthlyCsvHeaders, rows), count: rows.length };
}
