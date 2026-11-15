import type { Payload } from "payload";
import { isActiveStaff, isAdmin, type Staff } from "../../cms/access";
import { monthlyCsvHeaders, monthlyPerformanceCsv } from "../../lib/staff-monthly-csv";
import { ContentError } from "../content/error";
import { businessTransaction } from "../business/service";
import { auditCsvExport } from "../reporting/csv-audit";
import { readMonthlyPerformanceExport } from "./monthly";

function exportFilters(input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "month" && key !== "staff")
  )
    throw new ContentError("请从月报页面重新选择月份和员工后导出。");
  const { month, staff } = input as Record<string, unknown>;
  if (typeof month !== "string" || (staff !== undefined && typeof staff !== "string"))
    throw new ContentError("请选择有效的报表月份和员工。");
  return { month, staff };
}

export async function exportMonthlyPerformance(
  payload: Payload,
  user: Staff,
  input: unknown,
  now?: number,
) {
  const { actor, filters, reports, asOf } = await readMonthlyPerformanceExport(
    payload,
    user,
    exportFilters(input),
    now,
  );
  const result = monthlyPerformanceCsv(reports);
  await businessTransaction(payload, async (req) => {
    // Staff writes take the same lock, so permissions stay fixed through the audit commit.
    const currentActor = await payload.findByID({
      collection: "staff",
      id: actor,
      depth: 0,
      disableErrors: true,
      req,
    });
    if (!isActiveStaff(currentActor) || (filters.scope !== "self" && !isAdmin(currentActor)))
      throw new ContentError("员工权限已变更，请刷新后再试。", 403);
    await auditCsvExport(
      payload,
      "staff-monthly-performance",
      actor,
      monthlyCsvHeaders,
      {
        filters,
        count: result.count,
        employees: reports.length,
        asOf,
        includeSensitive: false,
      },
      req,
    );
  });
  return { ...result, filename: `staff-monthly-${filters.month}.csv` };
}
