import { quoteTime } from "./quote-time.ts";
import { quoteLinesView, type QuoteLineView } from "./quote-lines.ts";
import { StaffFormError } from "./staff-form-feedback.ts";

export const businessStages = [
  "received",
  "discovery",
  "quoting",
  "awaiting-confirmation",
  "accepted",
  "scheduled",
  "in-service",
  "completed",
  "paused",
  "cancelled",
  "aftercare",
] as const;
export const stageLabels: Record<string, string> = {
  received: "待受理",
  discovery: "需求沟通",
  quoting: "待报价",
  "awaiting-confirmation": "待客户确认",
  accepted: "方案已确认，待安排",
  scheduled: "安排已落实",
  "in-service": "服务中",
  completed: "已完成",
  paused: "已暂停",
  cancelled: "已取消",
  aftercare: "售后处理中",
};
function bounded(v: unknown, label: string, max = 4000) {
  if (typeof v !== "string" || !v.trim()) throw new StaffFormError(`请填写「${label}」。`);
  if (v.length > max) throw new StaffFormError(`「${label}」最多 ${max} 字，请缩短后再保存。`);
  return v.trim();
}
export function validateQuote(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object")
    throw new StaffFormError("请打开报价草稿，填写报价内容后再保存。");
  const input = value as Record<string, unknown>;
  const title = bounded(input.title, "方案名称", 200);
  const scope = bounded(input.scope, "服务范围");
  const included = bounded(input.included, "包含项目");
  const excluded = bounded(input.excluded, "不包含项目");
  const terms = bounded(input.terms, "变更与取消规则");
  const currency = (["CNY", "USD", "EUR", "GBP", "AED"] as const).find(
    (code) => code === input.currency,
  );
  if (!currency) throw new StaffFormError("请从「币种」中选择报价使用的货币。");
  const end = quoteTime(input.expiresAt);
  if (!Number.isFinite(end) || end <= now || end > now + 366 * 86400000)
    throw new StaffFormError("请将「有效期（北京时间）」选在当前时间以后、一年以内。");
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 30)
    throw new StaffFormError("请保留 1 至 30 项费用，再保存报价。");
  const lines = input.lines.map((line: unknown, index) => {
    const item = `第 ${index + 1} 项费用`;
    if (!line || typeof line !== "object")
      throw new StaffFormError(`请重新填写${item}的名称、数量和单价。`);
    const { label: name, quantity, unitMinor } = line as Record<string, unknown>;
    const label = bounded(name, `${item}的名称`, 200);
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000
    )
      throw new StaffFormError(`请把${item}的「数量」填为 1 至 10,000 之间的整数。`);
    if (
      typeof unitMinor !== "number" ||
      !Number.isSafeInteger(unitMinor) ||
      unitMinor < 0 ||
      unitMinor > 100000000
    )
      throw new StaffFormError(
        `请把${item}的「单价」填为 0 至 1,000,000 之间的金额，最多两位小数。`,
      );
    return { label, quantity, unitMinor };
  });
  const totalMinor = lines.reduce((n, l) => n + l.quantity * l.unitMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 1000000000)
    throw new StaffFormError("报价总额最多为 10,000,000，请检查费用项的数量和单价。");
  return {
    title,
    scope,
    included,
    excluded,
    terms,
    currency,
    expiresAt: new Date(end).toISOString(),
    lines,
    totalMinor,
  };
}
export function canConfirmQuote(q: any, latest: unknown, now = Date.now()) {
  return (
    q.status === "sent" &&
    Number(q.id) === Number(latest) &&
    Number.isFinite(Date.parse(q.expiresAt)) &&
    Date.parse(q.expiresAt) > now
  );
}
export function allowedTransition(from: string, to: string, confirmed: boolean, arranged: boolean) {
  const next: Record<string, string[]> = {
    received: ["discovery", "quoting", "paused", "cancelled"],
    discovery: ["quoting", "paused", "cancelled"],
    quoting: ["discovery", "paused", "cancelled"],
    "awaiting-confirmation": ["quoting", "paused", "cancelled"],
    accepted: ["scheduled", "quoting", "paused", "cancelled"],
    scheduled: ["in-service", "accepted", "paused", "cancelled"],
    "in-service": ["completed", "paused", "aftercare"],
    completed: ["aftercare"],
    paused: ["discovery", "cancelled"],
    aftercare: ["completed", "paused", "cancelled"],
    cancelled: [],
  };
  return (
    !!next[from]?.includes(to) &&
    (!["scheduled", "in-service", "completed"].includes(to) || confirmed) &&
    (!["scheduled", "in-service"].includes(to) || arranged)
  );
}
export function publicQuote(q: any): Record<string, unknown> & { lines: QuoteLineView[] } {
  const summary = Object.fromEntries(
    [
      "id",
      "revision",
      "status",
      "title",
      "scope",
      "included",
      "excluded",
      "terms",
      "currency",
      "totalMinor",
      "expiresAt",
      "sentAt",
      "confirmedAt",
    ].map((k) => [k, q[k] ?? null]),
  );
  return { ...summary, lines: quoteLinesView(q.lines, q.lineFormat) };
}
