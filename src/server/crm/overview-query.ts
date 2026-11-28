import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { isAdmin, isManager, relationID } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import {
  overviewDay,
  type ClientRow,
  type OwnerDisplay,
  type OverviewQuery,
} from "../../lib/crm-overview";
import { executeSQL } from "../db-types";
import type { CrmActor } from "./access";
export type Row = Record<string, unknown>;
export type Statement = ReturnType<typeof sql>;
export async function rows(
  p: Payload,
  req: Partial<PayloadRequest>,
  query: Statement,
): Promise<Row[]> {
  return (await executeSQL(p, (await req.transactionID)!, query)).rows;
}
export function scopeSQL(alias: "c" | "q", actor: CrmActor): Statement {
  if (isAdmin(actor)) return sql`true`;
  const t = sql.identifier(alias),
    team = relationID(actor.team);
  if (!team) return sql`false`;
  return isManager(actor)
    ? sql`${t}.team_id = ${Number(team)}`
    : sql`${t}.team_id = ${Number(team)} AND ${t}.owner_id = ${Number(actor.id)}`;
}
export function ownerColumns(alias: "c" | "q") {
  const t = sql.identifier(alias);
  return sql`o.name AS owner_name, CASE
    WHEN ${t}.owner_id IS NULL THEN 'unassigned'
    WHEN o.id IS NULL THEN 'ineligible'
    WHEN o.active IS FALSE THEN 'inactive'
    WHEN o.team_id = ${t}.team_id AND (o.role = 'operations' OR EXISTS (
      SELECT 1 FROM staff_additional_roles r WHERE r.parent_id=o.id AND r.value='operations'
    )) THEN 'valid' ELSE 'ineligible' END AS owner_state`;
}
export function overviewCTE(actor: CrmActor, asOf: string) {
  const day = overviewDay(asOf);
  return sql`WITH visible AS (SELECT q.* FROM inquiries q WHERE ${scopeSQL("q", actor)}),
    stats AS (SELECT l.client_id,
      count(*) FILTER (WHERE v.status <> 'closed')::integer AS inq_count,
      count(s.id) FILTER (WHERE s.stage NOT IN ('completed','cancelled'))::integer AS case_count,
      min(v.next_follow_up) FILTER (WHERE v.status <> 'closed') AS next_followup,
      bool_or(v.next_follow_up IS NOT NULL AND NOT isfinite(v.next_follow_up)) AS bad_date,
      bool_or(v.status <> 'closed' AND v.next_follow_up >= ${day.start}::timestamptz
        AND v.next_follow_up < ${day.end}::timestamptz) AS has_due_today,
      bool_or(v.status <> 'closed' AND v.next_follow_up < ${asOf}::timestamptz) AS has_overdue,
      greatest(max(v.updated_at),max(s.updated_at)) AS last_business_update
      FROM crm_inquiry_links l JOIN visible v ON v.id=l.inquiry_id
      LEFT JOIN service_cases s ON s.inquiry_id=v.id WHERE l.active=true GROUP BY l.client_id)`;
}
export function clientColumns() {
  return sql`c.*, ${ownerColumns("c")}, coalesce(st.inq_count,0) AS inq_count,
    coalesce(st.case_count,0) AS case_count, st.next_followup, st.bad_date,
    greatest(c.updated_at,st.last_business_update) AS last_visible_update`;
}
export function clientFilters(actor: CrmActor, input: OverviewQuery) {
  const filters = [scopeSQL("c", actor), sql`c.status = ${input.status ?? "active"}`];
  if (input.kind) filters.push(sql`c.kind = ${input.kind}`);
  if (input.teamID) filters.push(sql`c.team_id = ${input.teamID}`);
  if (input.owner === "mine") filters.push(sql`c.owner_id = ${Number(actor.id)}`);
  if (input.q?.trim()) {
    const needle = input.q.trim();
    filters.push(
      sql`(position(lower(${needle}) in lower(c.reference))>0 OR position(lower(${needle}) in lower(c.display_name))>0)`,
    );
  }
  if (input.work === "active")
    filters.push(sql`(coalesce(st.inq_count,0)>0 OR coalesce(st.case_count,0)>0)`);
  if (input.work === "dueToday") filters.push(sql`(st.has_due_today OR st.bad_date)`);
  if (input.work === "overdue") filters.push(sql`(st.has_overdue OR st.bad_date)`);
  return sql.join(filters, sql` AND `);
}
export function integer(value: unknown, min = 1): number {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(n) || n < min)
    throw new CrmError("资料格式异常，请联系管理员核对", 503);
  return n;
}
export function time(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(d.getTime())) throw new CrmError("时间资料异常，请联系管理员核对", 503);
  return d.toISOString();
}
export function ownerDTO(r: Row): OwnerDisplay {
  const state = r.owner_state;
  if (!["valid", "unassigned", "inactive", "ineligible"].includes(String(state)))
    throw new CrmError("负责人资料异常", 503);
  return {
    id: r.owner_id == null ? null : integer(r.owner_id),
    name: typeof r.owner_name === "string" ? r.owner_name : null,
    state: state as OwnerDisplay["state"],
  };
}
export function clientDTO(r: Row): ClientRow {
  if (r.bad_date) throw new CrmError("时间资料异常，请联系管理员核对", 503);
  const owner = ownerDTO(r);
  return {
    id: integer(r.id),
    reference: String(r.reference),
    kind: r.kind as ClientRow["kind"],
    displayName: String(r.display_name),
    language: r.language as ClientRow["language"],
    countryCode: r.country_code == null ? null : String(r.country_code),
    teamID: integer(r.team_id),
    ownerID: owner.id,
    status: r.status as ClientRow["status"],
    revision: integer(r.revision),
    createdAt: time(r.created_at),
    ownerState: owner.state,
    ownerDisplay: owner,
    visibleInquiryCount: integer(r.inq_count, 0),
    visibleCaseCount: integer(r.case_count, 0),
    nextFollowUp: r.next_followup == null ? null : time(r.next_followup),
    lastVisibleUpdate: time(r.last_visible_update),
  };
}
export function page<T>(items: T[], total: number, input: OverviewQuery, asOf: string) {
  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    asOf,
    timeZone: "Asia/Shanghai" as const,
  };
}
