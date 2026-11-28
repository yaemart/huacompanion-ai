import { parseFollowupQuery } from "./crm-followups.ts";
import { assignmentActions, parseAssignmentURL, type AssignmentQuery } from "./crm-assignments.ts";
import { overviewActions, parseCrmOverviewQuery, type OverviewQuery } from "./crm-overview.ts";
import { CrmError } from "./crm.ts";
export function crmQuery(url: string) {
  const q = new URL(url).searchParams;
  if (["followupList", "followupEvents"].includes(q.get("action") ?? ""))
    return parseFollowupQuery(url);
  if (assignmentActions.includes(q.get("action") as AssignmentQuery["action"]))
    return parseAssignmentURL(url);
  if (overviewActions.includes(q.get("action") as OverviewQuery["action"]))
    return parseCrmOverviewQuery(url);
  const result: Record<string, unknown> = {};
  for (const [key, value] of q) {
    if (key in result || !["action", "clientID", "page", "limit", "q", "status"].includes(key))
      throw new CrmError("查询参数无效");
    if (["clientID", "page", "limit"].includes(key)) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new CrmError("查询编号无效");
      result[key] = Number(value);
    } else result[key] = value;
  }
  return result;
}
