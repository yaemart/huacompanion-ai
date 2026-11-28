import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { isManager } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import {
  assignmentInput,
  type AssignmentQuery,
  type AssignmentRead,
  type TransferPreview,
  type AssignmentEvent,
} from "../../lib/crm-assignments";
import { transactionSession } from "../db-types";
import { currentActor, requireClient, type CrmActor } from "./access";
import { rows, scopeSQL, ownerColumns, ownerDTO, integer, time, page } from "./overview-query";
export async function transferPreview(
  p: Payload,
  actor: CrmActor,
  i: AssignmentQuery,
  req: Partial<PayloadRequest>,
): Promise<TransferPreview> {
  const c = await requireClient(p, actor, i.clientID, req);
  if (c.status !== "active") throw new CrmError("已存档客户不能转交", 409);
  const owners = await rows(
    p,
    req,
    sql`SELECT c.owner_id,${ownerColumns("c")} FROM crm_clients c
    LEFT JOIN staff o ON o.id=c.owner_id WHERE c.id=${c.id}`,
  );
  const receivers = await rows(
    p,
    req,
    sql`SELECT o.id,o.name FROM staff o WHERE o.team_id=${Number(c.team)} AND o.active IS NOT FALSE
    AND (o.role='operations' OR EXISTS(SELECT 1 FROM staff_additional_roles r WHERE r.parent_id=o.id AND r.value='operations'))
    ORDER BY o.name ASC,o.id ASC`,
  );
  const source = sql`FROM inquiries q JOIN crm_inquiry_links l ON l.inquiry_id=q.id AND l.active=true
    LEFT JOIN service_cases s ON s.inquiry_id=q.id LEFT JOIN staff o ON o.id=q.owner_id
    WHERE l.client_id=${c.id} AND ${scopeSQL("q", actor)} AND q.team_id=${Number(c.team)} AND q.status <> 'closed'
    AND (s.id IS NULL OR s.stage NOT IN ('completed','cancelled'))`;
  const total = await rows(p, req, sql`SELECT count(*)::integer AS total ${source}`);
  const items = await rows(
    p,
    req,
    sql`SELECT q.id,q.reference,q.name,q.updated_at,q.owner_id,${ownerColumns("q")},
    s.id AS case_id,s.revision AS case_revision,s.title,s.stage ${source}
    ORDER BY q.created_at DESC,q.id DESC LIMIT ${i.limit} OFFSET ${(i.page - 1) * i.limit}`,
  );
  return {
    clientID: c.id,
    expectedClientRevision: c.revision,
    clientOwner: ownerDTO(owners[0]),
    receivers: receivers.map((r) => ({ id: integer(r.id), name: String(r.name) })),
    inquiries: items.map((r) => ({
      inquiryID: integer(r.id),
      expectedUpdatedAt: time(r.updated_at),
      expectedOwnerID: r.owner_id == null ? null : integer(r.owner_id),
      expectedCaseRevision: r.case_id == null ? null : integer(r.case_revision),
      reference: String(r.reference),
      name: String(r.name),
      ownerDisplay: ownerDTO(r),
      serviceCase:
        r.case_id == null
          ? null
          : { id: integer(r.case_id), title: String(r.title), stage: String(r.stage) },
    })),
    total: integer(total[0].total, 0),
    page: i.page,
    limit: i.limit,
  };
}
export async function assignmentHistory(
  p: Payload,
  actor: CrmActor,
  i: AssignmentQuery,
  req: Partial<PayloadRequest>,
) {
  await requireClient(p, actor, i.clientID, req);
  const base = sql`WITH projected AS (
    SELECT a.id,a.created_at,author.name AS actor_name,recipient.name AS recipient_name,
      a."after"->'transferredClient' = 'true'::jsonb AS transferred_client,
      ARRAY(SELECT q.id FROM inquiries q JOIN crm_inquiry_links l ON l.inquiry_id=q.id AND l.active=true
        WHERE l.client_id=${i.clientID} AND ${scopeSQL("q", actor)} AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a."after"->'inquiryIDs')='array'
            THEN a."after"->'inquiryIDs' ELSE '[]'::jsonb END) selected(value)
          WHERE selected.value=to_jsonb(q.id)) ORDER BY q.id) AS inquiry_ids
    FROM audit_events a LEFT JOIN staff author ON author.id=a.actor_id
    LEFT JOIN staff recipient ON to_jsonb(recipient.id)=a."after"->'recipientID'
    WHERE a.entity='crm' AND a.action='transferAssignments' AND a.record_id=${String(i.clientID)}
      AND a."after"->'schema' = '1'::jsonb AND a."after"->'clientID'=to_jsonb(${i.clientID}::integer)),
    visible AS (SELECT * FROM projected WHERE transferred_client=true OR cardinality(inquiry_ids)>0)`;
  const count = await rows(p, req, sql`${base} SELECT count(*)::integer AS total FROM visible`);
  const list = await rows(
    p,
    req,
    sql`${base} SELECT * FROM visible ORDER BY created_at DESC,id DESC
    LIMIT ${i.limit} OFFSET ${(i.page - 1) * i.limit}`,
  );
  return page<AssignmentEvent>(
    list.map((r) => ({
      id: integer(r.id),
      time: time(r.created_at),
      actorName: r.actor_name == null ? null : String(r.actor_name),
      recipientName: r.recipient_name == null ? null : String(r.recipient_name),
      transferredClient: r.transferred_client === true,
      inquiryIDs: (r.inquiry_ids as unknown[]).map((id) => integer(id)),
    })),
    integer(count[0].total, 0),
    { action: "overview", clientID: i.clientID, page: i.page, limit: i.limit },
    new Date().toISOString(),
  );
}
export async function crmAssignmentsRead(
  p: Payload,
  user: CrmActor,
  raw: unknown,
): Promise<AssignmentRead> {
  const i = assignmentInput(raw),
    id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    const db = transactionSession(p, id).db;
    await db.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY");
    await db.execute("SELECT pg_advisory_xact_lock(726281)");
    await db.execute("SELECT pg_advisory_xact_lock(726283)");
    const req: Partial<PayloadRequest> = { transactionID: id },
      actor = await currentActor(p, user, req);
    if (!isManager(actor)) throw new CrmError("需要客户转交管理权限", 403);
    const result =
      i.action === "transferPreview"
        ? await transferPreview(p, actor, i, req)
        : await assignmentHistory(p, actor, i, req);
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
