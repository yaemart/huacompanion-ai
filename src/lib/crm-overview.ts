import { CrmError, crmID } from "./crm.ts";
export const overviewActions = ["overviewList", "overview", "assignmentQueue"] as const;
export interface OverviewQuery {
  action: (typeof overviewActions)[number];
  page: number;
  limit: number;
  clientID?: number;
  q?: string;
  status?: "active" | "archived";
  kind?: "individual" | "company";
  owner?: "mine" | "unassigned";
  teamID?: number;
  work?: "active" | "dueToday" | "overdue";
  target?: "client" | "inquiry";
}
export function overviewInput(raw: unknown): OverviewQuery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CrmError("查询无效");
  const i = raw as Record<string, unknown>;
  if (!overviewActions.includes(i.action as OverviewQuery["action"]))
    throw new CrmError("查询操作无效");
  const allowed =
    i.action === "overviewList"
      ? ["action", "page", "limit", "q", "status", "kind", "owner", "teamID", "work"]
      : i.action === "overview"
        ? ["action", "clientID", "page", "limit"]
        : ["action", "target", "page", "limit"];
  if (Object.keys(i).some((k) => !allowed.includes(k))) throw new CrmError("查询包含未允许字段");
  const out: Record<string, unknown> & {
    action: OverviewQuery["action"];
    page: number;
    limit: number;
  } = {
    ...i,
    action: i.action as OverviewQuery["action"],
    page: i.page === undefined ? 1 : crmID(i.page),
    limit: i.limit === undefined ? 20 : crmID(i.limit),
  };
  if (out.page > 100000 || out.limit > 50) throw new CrmError("分页超出范围");
  if (i.action === "overview") out.clientID = crmID(i.clientID);
  if (i.teamID !== undefined) out.teamID = crmID(i.teamID);
  const enums: Record<string, string[]> = {
    status: ["active", "archived"],
    kind: ["individual", "company"],
    owner: ["mine", "unassigned"],
    work: ["active", "dueToday", "overdue"],
    target: ["client", "inquiry"],
  };
  for (const [k, values] of Object.entries(enums))
    if (i[k] !== undefined && (typeof i[k] !== "string" || !values.includes(i[k] as string)))
      throw new CrmError("查询选项无效");
  if (i.action === "assignmentQueue" && !i.target) throw new CrmError("请选择队列类型");
  if (i.q !== undefined && (typeof i.q !== "string" || i.q.length > 100))
    throw new CrmError("搜索文字过长");
  if (i.action === "overviewList") out.status = i.status ?? "active";
  return out as OverviewQuery;
}
export function parseCrmOverviewQuery(url: string): OverviewQuery {
  const result: Record<string, unknown> = {};
  for (const [key, value] of new URL(url).searchParams) {
    if (Object.hasOwn(result, key)) throw new CrmError("查询参数重复");
    if (["clientID", "teamID", "page", "limit"].includes(key)) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new CrmError("查询编号无效");
      Object.defineProperty(result, key, { value: Number(value), enumerable: true });
    } else Object.defineProperty(result, key, { value, enumerable: true });
  }
  return overviewInput(result);
}
export function overviewDay(asOf: string) {
  const time = Date.parse(asOf);
  if (!Number.isFinite(time)) throw new CrmError("时间资料异常，请联系管理员核对", 503);
  const start = Math.floor((time + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
  return { start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString() };
}
export type OwnerState = "valid" | "unassigned" | "inactive" | "ineligible";
export interface OwnerDisplay {
  id: number | null;
  name: string | null;
  state: OwnerState;
}
export interface OverviewPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  asOf: string;
  timeZone: "Asia/Shanghai";
}
export interface ClientRow {
  id: number;
  reference: string;
  kind: "individual" | "company";
  displayName: string;
  language: "en" | "zh";
  countryCode: string | null;
  teamID: number;
  ownerID: number | null;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  ownerState: OwnerState;
  ownerDisplay: OwnerDisplay;
  visibleInquiryCount: number;
  visibleCaseCount: number;
  nextFollowUp: string | null;
  lastVisibleUpdate: string;
}
export interface QueueItem {
  target: "client" | "inquiry";
  clientID: number;
  inquiryID?: number;
  reference: string;
  name: string;
  ownerDisplay: OwnerDisplay;
  needsReview: boolean;
}
export interface InquiryRow {
  id: number;
  reference: string;
  name: string;
  status: string;
  ownerDisplay: OwnerDisplay;
  nextFollowUp: string | null;
  updatedAt: string;
  needsReview: boolean;
  serviceCase: {
    id: number;
    title: string;
    stage: string;
    revision: number;
    latestQuote: { id: number; revision: number; status: string } | null;
  } | null;
}
export interface PrimaryContact {
  id: number;
  clientID: number;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  status: "active" | "archived";
  revision: number;
}
export interface RecentUpdate {
  kind: "client-created" | "client" | "inquiry" | "serviceCase";
  id: number;
  at: string;
  label: string;
}
export interface OverviewDetail {
  client: ClientRow;
  primaryContact: PrimaryContact | null;
  inquiries: OverviewPage<InquiryRow>;
  recentUpdates: RecentUpdate[];
}
export type OverviewResult = OverviewPage<ClientRow> | OverviewPage<QueueItem> | OverviewDetail;
