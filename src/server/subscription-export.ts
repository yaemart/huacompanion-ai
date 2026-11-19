import type { Payload } from "payload";
import type { Staff } from "../cms/access";
import { csvDocument } from "../lib/reporting";
import { staffDate, staffDateTime } from "../lib/staff-display";
import { businessTransaction } from "./business/service";
import { ContentError } from "./content/error";
import { auditCsvExport } from "./reporting/csv-audit";
import {
  readSubscriptionManagement,
  requireSubscriptionAdmin,
  subscriptionStates,
} from "./subscription-management";

const headings = [
  "邮箱",
  "主题",
  "语言",
  "状态",
  "申请日（北京时间）",
  "确认日（北京时间）",
  "退订日（北京时间）",
  "统计截至（北京时间）",
];

export async function exportSubscriptionCsv(payload: Payload, user: Staff, input: unknown) {
  await requireSubscriptionAdmin(payload, user);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["topic", "status"].includes(key))
  )
    throw new ContentError("请从订阅管理选择主题和状态后导出。");
  const report = await readSubscriptionManagement(
    payload,
    user,
    input as Record<string, unknown>,
    true,
  );
  const titles = new Map(report.topics.map((topic) => [topic.topic, topic.title]));
  const rows = report.rows.map((row) => [
    row.email,
    titles.get(row.topic) ?? row.topic,
    { en: "英文", zh: "中文" }[row.locale] ?? row.locale,
    subscriptionStates[row.status],
    staffDate(row.consentedAt),
    staffDate(row.confirmedAt),
    staffDate(row.unsubscribedAt),
    staffDateTime(report.asOf, true),
  ]);
  const csv = csvDocument(headings, rows);
  const audit = await businessTransaction(payload, async (req) => {
    const actor = await requireSubscriptionAdmin(payload, user, req);
    return auditCsvExport(
      payload,
      "subscriptions",
      actor.id,
      headings,
      {
        filters: report.filters,
        count: rows.length,
        includeSensitive: false,
        asOf: report.asOf,
      },
      req,
    );
  });
  // The adapter can swallow a failed COMMIT. Confirm the audit exists before returning any CSV.
  const committed = await payload.findByID({
    collection: "audit-events",
    id: audit.id,
    depth: 0,
    disableErrors: true,
  });
  if (!committed) throw new ContentError("导出记录保存失败，请稍后重试。", 503);
  await requireSubscriptionAdmin(payload, user);
  return {
    csv,
    count: rows.length,
    asOf: report.asOf,
    filename: `subscriptions-${staffDate(report.asOf)}.csv`,
  };
}
