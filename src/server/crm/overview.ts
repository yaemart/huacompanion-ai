import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { isAdmin, isManager } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import {
  overviewInput,
  type OverviewQuery,
  type OverviewResult,
  type QueueItem,
} from "../../lib/crm-overview";
import { transactionSession } from "../db-types";
import { clientScope, currentActor, type CrmActor } from "./access";
import {
  clientColumns,
  clientDTO,
  clientFilters,
  integer,
  overviewCTE,
  ownerColumns,
  ownerDTO,
  page,
  rows,
  scopeSQL,
} from "./overview-query";
import { readOverviewDetail } from "./overview-detail";
async function clientList(
  p: Payload,
  actor: CrmActor,
  i: OverviewQuery,
  req: Partial<PayloadRequest>,
  asOf: string,
) {
  const base = sql`${overviewCTE(actor, asOf)}, filtered AS (
    SELECT ${clientColumns()} FROM crm_clients c LEFT JOIN staff o ON o.id=c.owner_id
    LEFT JOIN stats st ON st.client_id=c.id WHERE ${clientFilters(actor, i)})`;
  const condition = i.owner === "unassigned" ? sql`owner_state <> 'valid'` : sql`true`;
  const count = await rows(
    p,
    req,
    sql`${base} SELECT count(*)::integer AS total FROM filtered WHERE ${condition}`,
  );
  const list = await rows(
    p,
    req,
    sql`${base} SELECT * FROM filtered WHERE ${condition}
    ORDER BY created_at DESC,id DESC LIMIT ${i.limit} OFFSET ${(i.page - 1) * i.limit}`,
  );
  return page(list.map(clientDTO), integer(count[0].total, 0), i, asOf);
}
async function assignmentQueue(
  p: Payload,
  actor: CrmActor,
  i: OverviewQuery,
  req: Partial<PayloadRequest>,
  asOf: string,
) {
  const client = i.target === "client";
  const base = client
    ? sql`WITH filtered AS (
    SELECT c.id AS client_id,c.reference,c.display_name AS name,c.owner_id,c.created_at,
      ${ownerColumns("c")},false AS needs_review FROM crm_clients c
      LEFT JOIN staff o ON o.id=c.owner_id WHERE ${scopeSQL("c", actor)} AND c.status='active')`
    : sql`WITH filtered AS (
      SELECT c.id AS client_id,q.id AS inquiry_id,q.reference,q.name,q.owner_id,q.created_at,
      ${ownerColumns("q")}, (q.team_id IS DISTINCT FROM c.team_id) AS needs_review
      FROM crm_clients c JOIN crm_inquiry_links l ON l.client_id=c.id AND l.active=true
      JOIN inquiries q ON q.id=l.inquiry_id LEFT JOIN staff o ON o.id=q.owner_id
      WHERE ${scopeSQL("c", actor)} AND ${scopeSQL("q", actor)} AND c.status='active' AND q.status <> 'closed')`;
  const count = await rows(
    p,
    req,
    sql`${base} SELECT count(*)::integer AS total FROM filtered WHERE owner_state <> 'valid'`,
  );
  const list = await rows(
    p,
    req,
    sql`${base} SELECT * FROM filtered WHERE owner_state <> 'valid'
    ORDER BY created_at DESC,${client ? sql`client_id` : sql`inquiry_id`} DESC LIMIT ${i.limit} OFFSET ${(i.page - 1) * i.limit}`,
  );
  return page(
    list.map((r): QueueItem => ({
      target: i.target!,
      clientID: integer(r.client_id),
      ...(client ? {} : { inquiryID: integer(r.inquiry_id) }),
      reference: String(r.reference),
      name: String(r.name),
      ownerDisplay: ownerDTO(r),
      needsReview: r.needs_review === true || r.owner_state === "ineligible",
    })),
    integer(count[0].total, 0),
    i,
    asOf,
  );
}
export async function crmOverview(
  p: Payload,
  user: CrmActor,
  raw: unknown,
): Promise<OverviewResult> {
  const i = overviewInput(raw),
    id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    const db = transactionSession(p, id).db;
    await db.execute("SET TRANSACTION READ ONLY");
    await db.execute("SELECT pg_advisory_xact_lock(726281)");
    await db.execute("SELECT pg_advisory_xact_lock(726283)");
    const req: Partial<PayloadRequest> = { transactionID: id };
    const actor = await currentActor(p, user, req);
    clientScope(actor);
    if (i.teamID !== undefined && !isAdmin(actor)) throw new CrmError("不能指定团队筛选", 403);
    if ((i.action === "assignmentQueue" || i.owner === "unassigned") && !isManager(actor))
      throw new CrmError("需要管理权限", 403);
    const asOf = new Date().toISOString();
    const result =
      i.action === "overview"
        ? await readOverviewDetail(p, actor, i, req, asOf)
        : i.action === "assignmentQueue"
          ? await assignmentQueue(p, actor, i, req, asOf)
          : await clientList(p, actor, i, req, asOf);
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
