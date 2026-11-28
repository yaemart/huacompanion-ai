import { CrmError } from "./crm.ts";
export type FollowupContext =
  | { kind: "client"; id: number; revision: number }
  | { kind: "inquiry"; id: number; updatedAt: string };
export type FollowupReadContext = { kind: "client" | "inquiry"; id: number };
export interface FollowupDraft {
  title: string;
  description: string;
  dueAt: string;
  assigneeID: number | null;
}
export type Continuation =
  | { kind: "end"; reason: string }
  | ({ kind: "existing" } & Target)
  | ({ kind: "create" } & FollowupDraft);
type Base = { operationKey: string; context: FollowupContext };
export type Target = {
  taskID: number;
  expectedRevision: number;
  expectedInquiryUpdatedAt?: string;
  expectedLinkRevision?: number;
};
export type FollowupCommand = Base &
  (
    | ({ action: "createFollowup" } & FollowupDraft)
    | ({ action: "completeFollowup"; body: string; continuation: Continuation } & Target)
    | ({ action: "postponeFollowup"; dueAt: string; reason: string } & Target)
    | ({ action: "cancelFollowup"; reason: string; management: boolean } & Target)
    | ({ action: "appendFollowupNote"; body: string; management: boolean } & Target)
    | ({ action: "correctFollowup"; body: string; reason: string; management: boolean } & Target)
    | ({ action: "confirmFollowupReview" } & Target)
    | { action: "assignFollowups"; assigneeID: number; tasks: Target[] }
  );
export interface FollowupReceipt {
  kind: "followup";
  operationKey: string;
  tasks: { taskID: number; revision: number }[];
  eventIDs: number[];
  changedCount: number;
}
export interface FollowupItem {
  id: number;
  reference: string;
  anchorKind: "client" | "inquiry";
  anchorID: number;
  parentVersion: FollowupContext;
  linkRevision?: number;
  title: string;
  description: string;
  assigneeID: number | null;
  dueAt: string;
  state: "pending" | "completed" | "canceled";
  revision: number;
  needsReview: boolean;
  needsAssignment: boolean;
  suspended: boolean;
  overdue: boolean;
  dueToday: boolean;
}
export interface FollowupPage {
  asOf: string;
  context: FollowupContext;
  items: FollowupItem[];
  total: number;
  page: number;
  limit: number;
}
const bad = () => new CrmError("跟进参数无效");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(o).some((k) => !allowed.includes(k))) throw bad();
}
function id(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) throw bad();
  return v;
}
function text(v: unknown, min: number, max: number): string {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) throw bad();
  return v.trim();
}
function date(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v))
    throw bad();
  const d = new Date(v);
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().replace(".000Z", "Z") !== v.replace(".000Z", "Z")
  )
    throw bad();
  return d.toISOString();
}
function bool(v: unknown) {
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw bad();
  return v;
}
function draft(o: Record<string, unknown>): FollowupDraft {
  return {
    title: text(o.title, 1, 200),
    description: o.description === undefined ? "" : text(o.description, 0, 2000),
    dueAt: date(o.dueAt),
    assigneeID: o.assigneeID === null ? null : id(o.assigneeID),
  };
}
function target(o: Record<string, unknown>): Target {
  return {
    taskID: id(o.taskID),
    expectedRevision: id(o.expectedRevision),
    ...(o.expectedInquiryUpdatedAt === undefined
      ? {}
      : { expectedInquiryUpdatedAt: date(o.expectedInquiryUpdatedAt) }),
    ...(o.expectedLinkRevision === undefined
      ? {}
      : { expectedLinkRevision: id(o.expectedLinkRevision) }),
  };
}
export function parseFollowupCommand(value: unknown): FollowupCommand {
  const o = object(value),
    c = object(o.context);
  keys(c, c.kind === "client" ? ["kind", "id", "revision"] : ["kind", "id", "updatedAt"]);
  const context: FollowupContext =
    c.kind === "client"
      ? { kind: "client", id: id(c.id), revision: id(c.revision) }
      : c.kind === "inquiry"
        ? { kind: "inquiry", id: id(c.id), updatedAt: date(c.updatedAt) }
        : (() => {
            throw bad();
          })();
  const operationKey = text(o.operationKey, 36, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationKey))
    throw bad();
  const base = { context, operationKey },
    action = o.action;
  const common = ["action", "context", "operationKey"],
    t = ["taskID", "expectedRevision", "expectedInquiryUpdatedAt", "expectedLinkRevision"];
  if (action === "createFollowup") {
    keys(o, [...common, "title", "description", "dueAt", "assigneeID"]);
    return { ...base, action, ...draft(o) };
  }
  if (action === "assignFollowups") {
    keys(o, [...common, "assigneeID", "tasks"]);
    if (!Array.isArray(o.tasks) || !o.tasks.length || o.tasks.length > 20) throw bad();
    const tasks = o.tasks.map((v) => {
      const x = object(v);
      keys(x, t);
      return target(x);
    });
    if (new Set(tasks.map((v) => v.taskID)).size !== tasks.length) throw bad();
    return { ...base, action, assigneeID: id(o.assigneeID), tasks };
  }
  const dest = target(o);
  if (action === "confirmFollowupReview") {
    keys(o, [...common, ...t]);
    return { ...base, action, ...dest };
  }
  if (action === "postponeFollowup") {
    keys(o, [...common, ...t, "dueAt", "reason"]);
    return { ...base, action, ...dest, dueAt: date(o.dueAt), reason: text(o.reason, 10, 2000) };
  }
  if (action === "correctFollowup") {
    keys(o, [...common, ...t, "body", "reason", "management"]);
    return {
      ...base,
      ...dest,
      action,
      body: text(o.body, 1, 2000),
      reason: text(o.reason, 1, 2000),
      management: bool(o.management),
    };
  }
  if (action === "cancelFollowup" || action === "appendFollowupNote") {
    const field = action === "cancelFollowup" ? "reason" : "body";
    keys(o, [...common, ...t, field, "management"]);
    const management = bool(o.management);
    return action === "cancelFollowup"
      ? { ...base, ...dest, action, management, reason: text(o.reason, 1, 2000) }
      : { ...base, ...dest, action, management, body: text(o.body, 1, 2000) };
  }
  if (action === "completeFollowup") {
    keys(o, [...common, ...t, "body", "continuation"]);
    const n = object(o.continuation);
    let continuation: Continuation;
    if (n.kind === "end") {
      keys(n, ["kind", "reason"]);
      continuation = { kind: "end", reason: text(n.reason, 1, 2000) };
    } else if (n.kind === "existing") {
      keys(n, ["kind", ...t]);
      continuation = { kind: "existing", ...target(n) };
    } else if (n.kind === "create") {
      keys(n, ["kind", "title", "description", "dueAt", "assigneeID"]);
      continuation = { kind: "create", ...draft(n) };
    } else throw bad();
    return { ...base, action, ...dest, body: text(o.body, 1, 2000), continuation };
  }
  throw bad();
}
export function parseFollowupQuery(url: string) {
  const o: Record<string, string> = {};
  for (const [k, v] of new URL(url).searchParams) {
    if (k in o || !["action", "kind", "id", "page", "limit", "taskID"].includes(k)) throw bad();
    o[k] = v;
  }
  if (
    !["followupList", "followupEvents"].includes(o.action) ||
    !["client", "inquiry"].includes(o.kind)
  )
    throw bad();
  const num = (v: string) => {
    if (!/^[1-9]\d*$/.test(v)) throw bad();
    return id(Number(v));
  };
  const page = o.page === undefined ? 1 : num(o.page),
    limit = o.limit === undefined ? 20 : num(o.limit);
  if (page > 100000 || limit > 50 || (o.action === "followupList" && o.taskID !== undefined))
    throw bad();
  return {
    action: o.action,
    context: { kind: o.kind as "client" | "inquiry", id: num(o.id) },
    page,
    limit,
    ...(o.action === "followupEvents" ? { taskID: num(o.taskID) } : {}),
  };
}

export const followupActions = [
  "createFollowup",
  "appendFollowupNote",
  "completeFollowup",
  "postponeFollowup",
  "cancelFollowup",
  "assignFollowups",
  "confirmFollowupReview",
  "correctFollowup",
] as const;
