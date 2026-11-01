import type { Inquiry, Provider } from "../../payload-types";
export const inquiryStatuses = ["new", "needs-info", "processing", "quoted", "won", "closed"];
export const providerStatuses = ["applied", "needs-info", "verified", "contracted", "paused"];
export const reportingCategories = [
  "housekeeping",
  "medical",
  "business",
  "transport",
  "stays",
  "travel",
  "interpretation",
  "arrival",
];
export type ReportFilters = { from?: string; to?: string; status?: string; category?: string };
export function parseFilters(input: unknown): ReportFilters {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("筛选格式无效");
  const result: ReportFilters = {};
  for (const [key, value] of Object.entries(input)) {
    if (!["from", "to", "status", "category"].includes(key)) throw Error("不支持的筛选字段");
    if (value === "" || value === undefined) continue;
    if (typeof value !== "string") throw Error("筛选值无效");
    if (key === "from" || key === "to") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        throw Error("日期无效");
    } else if (key === "status" && ![...inquiryStatuses, ...providerStatuses].includes(value))
      throw Error("状态无效");
    else if (key === "category" && !reportingCategories.includes(value)) throw Error("类别无效");
    result[key as keyof ReportFilters] = value;
  }
  if (result.from && result.to && result.from > result.to) throw Error("起始日期晚于结束日期");
  return result;
}
export function csvDocument(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function mondayChina(date: string): string {
  const shifted = new Date(Date.parse(date) + 8 * 3600000);
  shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7));
  return shifted.toISOString().slice(0, 10);
}
type InquiryMetric = Pick<Inquiry, "id" | "createdAt"> & {
  categories: string[];
  status: string;
  source?: string | null;
};
export type QuoteMetric = { inquiry: number; sentAt?: string | null; confirmedAt?: string | null };
export function summarize(
  inquiries: InquiryMetric[],
  providers: Pick<Provider, "status">[],
  quotes: QuoteMetric[],
  responses: Map<number, string[]> = new Map(),
) {
  const weeks: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const providerStatuses: Record<string, number> = {};
  const count = (target: Record<string, number>, key: string) => {
    target[key] = (target[key] || 0) + 1;
  };
  let quoted = 0;
  let won = 0;
  const durations: number[] = [];
  const quotesByInquiry = new Map<number, QuoteMetric[]>();
  for (const quote of quotes) {
    const history = quotesByInquiry.get(quote.inquiry) || [];
    history.push(quote);
    quotesByInquiry.set(quote.inquiry, history);
  }
  for (const inquiry of inquiries) {
    count(weeks, mondayChina(inquiry.createdAt));
    for (const category of inquiry.categories) count(categories, category);
    count(statuses, inquiry.status);
    count(sources, inquiry.source || "未记录");
    const history = quotesByInquiry.get(inquiry.id) || [];
    const hasWon = inquiry.status === "won" || history.some((quote) => !!quote.confirmedAt);
    if (hasWon) won++;
    if (hasWon || inquiry.status === "quoted" || history.some((quote) => !!quote.sentAt)) quoted++;
    const candidates = [
      ...history.map((quote) => quote.sentAt),
      ...(responses.get(inquiry.id) || []),
    ]
      .filter((at): at is string => !!at)
      .map(Date.parse)
      .filter((at) => Number.isFinite(at) && at >= Date.parse(inquiry.createdAt));
    if (candidates.length)
      durations.push((Math.min(...candidates) - Date.parse(inquiry.createdAt)) / 60000);
  }
  for (const provider of providers) count(providerStatuses, provider.status);
  durations.sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const medianMinutes = durations.length
    ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2
    : null;
  return {
    weeks,
    categories,
    statuses,
    sources,
    providerStatuses,
    funnel: { inquiries: inquiries.length, quoted, won },
    firstResponse: { medianMinutes, measuredCount: durations.length, total: inquiries.length },
  };
}
export type OperationsSummary = ReturnType<typeof summarize>;
