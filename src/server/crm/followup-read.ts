import type { Payload, PayloadRequest } from "payload";
import { relationID } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import type { FollowupPage, FollowupReadContext, FollowupItem } from "../../lib/crm-followups";
import { transactionSession } from "../db-types";
import { currentActor, type CrmActor } from "./access";
import { followupAnchor, followupScope, followupTask, effectiveAssignee } from "./followup-access";
export async function followupReadTransaction<T>(
  p: Payload,
  user: CrmActor,
  fn: (actor: CrmActor, req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    const db = transactionSession(p, id).db;
    await db.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY");
    await db.execute("SELECT pg_advisory_xact_lock(726281)");
    await db.execute("SELECT pg_advisory_xact_lock(726283)");
    const req = { transactionID: id };
    const result = await fn(await currentActor(p, user, req), req);
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
function paging(page: number, limit: number) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new CrmError("分页超出范围");
}
export async function followupList(
  p: Payload,
  user: CrmActor,
  context: FollowupReadContext,
  page = 1,
  limit = 20,
): Promise<FollowupPage> {
  paging(page, limit);
  return followupReadTransaction(p, user, async (actor, req) => {
    const anchor = await followupAnchor(p, actor, context, req);
    const scope = await followupScope(p, actor, context, req);
    const asOf = new Date().toISOString(),
      now = Date.parse(asOf);
    const start = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
    const result = await p.find({
      collection: "crm-followups",
      where: scope,
      sort: ["dueAt", "id"],
      page,
      limit,
      depth: 0,
      req,
    });
    const items: FollowupItem[] = [];
    for (const task of result.docs) {
      const { anchor: own, linkRevision } = await followupTask(p, actor, context, task.id, req);
      const effective = await effectiveAssignee(p, own, req);
      const needsAssignment = effective === null || effective !== relationID(task.assignee);
      const suspended = anchor.suspended || own.suspended;
      const executable =
        task.state === "pending" && !suspended && !needsAssignment && !task.needsReview;
      const due = Date.parse(task.dueAt);
      items.push({
        id: task.id,
        reference: task.reference,
        anchorKind: task.anchorKind,
        anchorID: own.id,
        parentVersion: own.version,
        ...(linkRevision === undefined ? {} : { linkRevision }),
        title: task.title,
        description: task.description ?? "",
        assigneeID: Number(relationID(task.assignee)) || null,
        dueAt: task.dueAt,
        state: task.state,
        revision: task.revision,
        needsReview: task.needsReview,
        needsAssignment,
        suspended,
        overdue: executable && due < now,
        dueToday: executable && due >= start && due < start + 86400000,
      });
    }
    return { asOf, context: anchor.version, items, total: result.totalDocs, page, limit };
  });
}
export async function followupEvents(
  p: Payload,
  user: CrmActor,
  context: FollowupReadContext,
  taskID: number,
  page = 1,
  limit = 20,
) {
  paging(page, limit);
  return followupReadTransaction(p, user, async (actor, req) => {
    await followupTask(p, actor, context, taskID, req);
    const result = await p.find({
      collection: "crm-followup-events",
      where: { task: { equals: taskID } },
      sort: "-seq",
      page,
      limit,
      depth: 0,
      req,
    });
    return {
      items: result.docs.map((e) => ({
        id: e.id,
        seq: e.seq,
        action: e.action,
        actorID: relationID(e.actor),
        at: e.serverTime,
        details: e.details,
      })),
      total: result.totalDocs,
      page,
      limit,
    };
  });
}
