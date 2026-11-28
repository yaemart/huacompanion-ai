import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { relationID } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import { transactionSession } from "../db-types";
export async function sourceRows(
  p: Payload,
  statement: ReturnType<typeof sql>,
  req?: Partial<PayloadRequest>,
) {
  const id = await req?.transactionID;
  const db = id ? transactionSession(p, id).db : (p.db as unknown as PostgresAdapter).drizzle;
  return (await db.execute(statement as unknown as Parameters<typeof db.execute>[0]))
    .rows as Record<string, unknown>[];
}
/** Exact old source family only; never suppress quote/policy/owner-change sources. */
export async function legacySourceSet(
  p: Payload,
  req?: Partial<PayloadRequest>,
  inquiryID?: number,
) {
  const root =
    inquiryID === undefined
      ? sql`SELECT inquiry_id AS id FROM crm_followup_slots WHERE cutover_state='managed'`
      : sql`SELECT id FROM inquiries WHERE id=${inquiryID}`;
  const rows = await sourceRows(
    p,
    sql`WITH roots AS (${root}), old_tasks AS (
    SELECT t.id FROM workflow_tasks t JOIN roots r ON t.inquiry_id=r.id
    WHERE t.key LIKE 'inquiry:'||r.id::text||':followup:%'
  ), old_events AS (
    SELECT e.id FROM workflow_events e WHERE EXISTS(
      SELECT 1 FROM roots r WHERE e.key LIKE 'inquiry:'||r.id::text||':followup:%')
      OR substring(e.key FROM '^task:([0-9]+):')::integer IN (SELECT id FROM old_tasks)
  ), notices AS (SELECT n.id FROM workflow_notifications n WHERE n.event_id IN (SELECT id FROM old_events)
    OR EXISTS(SELECT 1 FROM roots r WHERE n.key LIKE 'inquiry:'||r.id::text||':followup:%')),
  customers AS (SELECT n.id FROM workflow_customer_notifications n WHERE EXISTS(
    SELECT 1 FROM roots r WHERE n.key LIKE 'inquiry:'||r.id::text||':followup:%'))
  SELECT 'task' AS kind,id,NULL::text AS status,NULL::numeric AS attempts FROM old_tasks
  UNION ALL SELECT 'notification',id,NULL,NULL FROM notices
  UNION ALL SELECT 'customer',id,NULL,NULL FROM customers
  UNION ALL SELECT 'mail',j.id,j.status::text,j.attempts FROM workflow_mail_jobs j
    WHERE j.notification_id IN(SELECT id FROM notices) OR j.customer_notification_id IN(SELECT id FROM customers)`,
    req,
  );
  return {
    tasks: rows.filter((r) => r.kind === "task").map((r) => Number(r.id)),
    notifications: rows.filter((r) => r.kind === "notification").map((r) => Number(r.id)),
    customers: rows.filter((r) => r.kind === "customer").map((r) => Number(r.id)),
    mail: rows
      .filter((r) => r.kind === "mail")
      .map((r) => ({
        id: Number(r.id),
        status: String(r.status),
        attempts: Number(r.attempts) || 0,
      })),
  };
}
export async function legacyInquiryForKey(
  p: Payload,
  key: string,
  req?: Partial<PayloadRequest>,
): Promise<number | null> {
  const direct = /^inquiry:([1-9][0-9]*):followup:/.exec(key);
  if (direct) return Number(direct[1]);
  const task = /^task:([1-9][0-9]*):/.exec(key);
  if (!task) return null;
  const doc = (
    await p.find({
      collection: "workflow-tasks",
      where: { id: { equals: Number(task[1]) } },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  const parent = doc ? /^inquiry:([1-9][0-9]*):followup:/.exec(doc.key) : null;
  return parent ? Number(parent[1]) : null;
}
export async function isManagedFollowupSource(
  p: Payload,
  key: string,
  req?: Partial<PayloadRequest>,
) {
  const id = await legacyInquiryForKey(p, key, req);
  if (!id) return false;
  return !!(
    await p.find({
      collection: "crm-followup-slots",
      where: { and: [{ inquiry: { equals: id } }, { cutoverState: { equals: "managed" } }] },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs.length;
}
export async function isManagedMailSource(
  p: Payload,
  job: { notification?: unknown; customerNotification?: unknown },
  req?: Partial<PayloadRequest>,
) {
  const n = relationID(job.notification),
    c = relationID(job.customerNotification);
  if (n) {
    const d = await p.findByID({ collection: "workflow-notifications", id: n, depth: 0, req });
    return isManagedFollowupSource(p, d.key, req);
  }
  if (c) {
    const d = await p.findByID({
      collection: "workflow-customer-notifications",
      id: c,
      depth: 0,
      req,
    });
    return isManagedFollowupSource(p, d.key, req);
  }
  return false;
}
/** Caller holds business→customer; coordinate with mail claim without changing attempted delivery history. */
export async function cutoverMailGate(p: Payload, req: Partial<PayloadRequest>, inquiryID: number) {
  const id = await req.transactionID;
  if (!id) throw Error("Cutover requires transaction");
  await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726282)");
  const sources = await legacySourceSet(p, req, inquiryID);
  const blocked = sources.mail.some(
    (j) =>
      j.status === "running" ||
      j.status === "uncertain" ||
      (j.attempts > 0 && !["sent", "disabled"].includes(j.status)),
  );
  return {
    blocked,
    suppress: sources.mail
      .filter((j) => j.attempts === 0 && !["sent", "running", "uncertain"].includes(j.status))
      .map((j) => j.id),
  };
}
export async function suppressUnattemptedMail(
  p: Payload,
  req: Partial<PayloadRequest>,
  ids: number[],
) {
  for (const id of ids) {
    const current = await p.findByID({ collection: "workflow-mail-jobs", id, depth: 0, req });
    if (current.attempts || ["sent", "running", "uncertain"].includes(current.status))
      throw new CrmError("旧发送状态已变化，请先核实", 409);
    await p.update({
      collection: "workflow-mail-jobs",
      id,
      req,
      data: { status: "disabled", nextAt: null, lease: null, leaseUntil: null },
    });
  }
}
