import { CrmError, crmID } from "./crm.ts";
import type { OwnerDisplay, OverviewPage } from "./crm-overview.ts";
export const assignmentActions = ["transferPreview", "assignmentHistory"] as const;
export interface TransferSelection {
  inquiryID: number;
  expectedUpdatedAt: string;
  expectedOwnerID: number | null;
  expectedCaseRevision: number | null;
}
export interface TransferInput {
  action: "transferAssignments";
  operationKey: string;
  clientID: number;
  expectedClientRevision: number;
  recipientID: number;
  transferClient: boolean;
  inquiries: TransferSelection[];
  reason: string;
}
function object(raw: unknown, keys: string[]): Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).some((k) => !keys.includes(k))
  )
    throw new CrmError("转交资料包含未允许字段");
  return raw as Record<string, unknown>;
}
export function parseTransferInput(raw: unknown): TransferInput {
  const i = object(raw, [
    "action",
    "operationKey",
    "clientID",
    "expectedClientRevision",
    "recipientID",
    "transferClient",
    "inquiries",
    "reason",
  ]);
  if (
    i.action !== "transferAssignments" ||
    typeof i.transferClient !== "boolean" ||
    !Array.isArray(i.inquiries) ||
    i.inquiries.length > 20 ||
    (!i.transferClient && !i.inquiries.length)
  )
    throw new CrmError("请选择1至20条咨询或客户负责人");
  if (
    typeof i.operationKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(i.operationKey)
  )
    throw new CrmError("转交操作编号无效");
  if (typeof i.reason !== "string" || i.reason.trim().length < 10 || i.reason.trim().length > 2000)
    throw new CrmError("请填写10至2000字转交原因");
  const inquiries = i.inquiries
    .map((rawItem) => {
      const q = object(rawItem, [
        "inquiryID",
        "expectedUpdatedAt",
        "expectedOwnerID",
        "expectedCaseRevision",
      ]);
      if (
        typeof q.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(q.expectedUpdatedAt)) ||
        new Date(q.expectedUpdatedAt).toISOString() !== q.expectedUpdatedAt
      )
        throw new CrmError("咨询时间版本无效");
      return {
        inquiryID: crmID(q.inquiryID),
        expectedUpdatedAt: q.expectedUpdatedAt,
        expectedOwnerID: q.expectedOwnerID === null ? null : crmID(q.expectedOwnerID),
        expectedCaseRevision:
          q.expectedCaseRevision === null ? null : crmID(q.expectedCaseRevision),
      };
    })
    .sort((a, b) => a.inquiryID - b.inquiryID);
  if (new Set(inquiries.map((q) => q.inquiryID)).size !== inquiries.length)
    throw new CrmError("不能重复选择咨询");
  return {
    action: "transferAssignments",
    operationKey: i.operationKey.toLowerCase(),
    clientID: crmID(i.clientID),
    expectedClientRevision: crmID(i.expectedClientRevision),
    recipientID: crmID(i.recipientID),
    transferClient: i.transferClient,
    inquiries,
    reason: i.reason.trim(),
  };
}
export interface AssignmentQuery {
  action: (typeof assignmentActions)[number];
  clientID: number;
  page: number;
  limit: number;
}
export function assignmentInput(raw: unknown): AssignmentQuery {
  const i = object(raw, ["action", "clientID", "page", "limit"]);
  if (!assignmentActions.includes(i.action as AssignmentQuery["action"]))
    throw new CrmError("转交查询无效");
  const page = i.page === undefined ? 1 : crmID(i.page),
    limit = i.limit === undefined ? 20 : crmID(i.limit);
  if (page > 100000 || limit > (i.action === "transferPreview" ? 20 : 50))
    throw new CrmError("转交查询分页超出范围");
  return {
    action: i.action as AssignmentQuery["action"],
    clientID: crmID(i.clientID),
    page,
    limit,
  };
}
export function parseAssignmentURL(url: string): AssignmentQuery {
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URL(url).searchParams) {
    if (Object.hasOwn(out, k)) throw new CrmError("查询参数重复");
    if (["clientID", "page", "limit"].includes(k)) {
      if (!/^[1-9][0-9]*$/.test(v) || !Number.isSafeInteger(Number(v)))
        throw new CrmError("查询编号无效");
      Object.defineProperty(out, k, { value: Number(v), enumerable: true });
    } else Object.defineProperty(out, k, { value: v, enumerable: true });
  }
  return assignmentInput(out);
}
export interface TransferReceipt {
  clientID: number;
  revision: number;
  transferID: number;
  transferredClient: boolean;
  inquiryIDs: number[];
}
export interface TransferPreview {
  clientID: number;
  expectedClientRevision: number;
  clientOwner: OwnerDisplay;
  receivers: { id: number; name: string }[];
  inquiries: (TransferSelection & {
    reference: string;
    name: string;
    ownerDisplay: OwnerDisplay;
    serviceCase: { id: number; title: string; stage: string } | null;
  })[];
  total: number;
  page: number;
  limit: number;
}
export interface AssignmentEvent {
  id: number;
  time: string;
  actorName: string | null;
  recipientName: string | null;
  transferredClient: boolean;
  inquiryIDs: number[];
}
export type AssignmentRead = TransferPreview | OverviewPage<AssignmentEvent>;
