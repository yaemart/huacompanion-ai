import { quoteTime } from "./quote-time.ts";

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
  if (typeof v !== "string" || !v.trim() || v.length > max) throw Error(label + "不能为空或过长");
  return v.trim();
}
export function validateQuote(input: any, now = Date.now()) {
  const title = bounded(input.title, "方案名称", 200),
    scope = bounded(input.scope, "服务范围"),
    included = bounded(input.included, "包含项目"),
    excluded = bounded(input.excluded, "不包含项目"),
    terms = bounded(input.terms, "变更规则");
  if (!["CNY", "USD", "EUR", "GBP", "AED"].includes(input.currency))
    throw Error("请选择支持的币种");
  const end = quoteTime(input.expiresAt);
  if (!Number.isFinite(end) || end <= now || end > now + 366 * 86400000)
    throw Error("有效期须在未来一年内");
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 30)
    throw Error("费用明细须为1至30项");
  const lines = input.lines.map((l: any) => {
    const label = bounded(l.label, "费用名称", 200);
    if (
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > 10000 ||
      !Number.isSafeInteger(l.unitMinor) ||
      l.unitMinor < 0 ||
      l.unitMinor > 100000000
    )
      throw Error("数量和最小货币单位金额必须为有效整数");
    return { label, quantity: l.quantity, unitMinor: l.unitMinor };
  });
  const totalMinor = lines.reduce((n: number, l: any) => n + l.quantity * l.unitMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 1000000000) throw Error("报价总额过大");
  return {
    title,
    scope,
    included,
    excluded,
    terms,
    currency: input.currency,
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
export function publicQuote(q: any) {
  return Object.fromEntries(
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
      "lines",
      "totalMinor",
      "expiresAt",
      "sentAt",
      "confirmedAt",
    ].map((k) => [k, q[k] ?? null]),
  );
}
