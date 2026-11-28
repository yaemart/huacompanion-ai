import type { Payload, PayloadRequest, Where } from "payload";
import type { CrmFollowup } from "../../../payload-types";
import { relationID } from "../../cms/access";
import { validOwner } from "../../cms/staff-guards";
import { CrmError } from "../../lib/crm";
import type { FollowupReadContext } from "../../lib/crm-followups";
import { isInquiryClosed } from "../../lib/inquiry-status";
import { requireClient, unavailable, type CrmActor } from "./access";
import { inquiryFilter } from "./links";
export type Anchor = Awaited<ReturnType<typeof followupAnchor>>;
export const followupConflict = () => new CrmError("跟进或父记录已变化，请核对后重试", 409);
export async function followupAnchor(
  p: Payload,
  actor: CrmActor,
  c: FollowupReadContext,
  req: Partial<PayloadRequest>,
) {
  if (c.kind === "client") {
    const doc = await requireClient(p, actor, c.id, req);
    return {
      ...c,
      ownerID: relationID(doc.owner),
      teamID: relationID(doc.team),
      suspended: doc.status !== "active",
      version: { kind: "client" as const, id: doc.id, revision: doc.revision },
    };
  }
  const doc = (
    await p.find({
      collection: "inquiries",
      where: { and: [inquiryFilter(actor), { id: { equals: c.id } }] },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (!doc) throw unavailable();
  return {
    ...c,
    ownerID: relationID(doc.owner),
    teamID: relationID(doc.team),
    suspended: isInquiryClosed(doc),
    version: { kind: "inquiry" as const, id: doc.id, updatedAt: doc.updatedAt },
  };
}
export async function followupTask(
  p: Payload,
  actor: CrmActor,
  context: FollowupReadContext,
  taskID: number,
  req: Partial<PayloadRequest>,
) {
  await followupAnchor(p, actor, context, req);
  const task = (
    await p.find({
      collection: "crm-followups",
      where: { id: { equals: taskID } },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (!task) throw unavailable();
  const c = taskContext(task);
  let linkRevision: number | undefined;
  if (context.kind === "inquiry") {
    if (c.kind !== "inquiry" || c.id !== context.id) throw unavailable();
  } else if (c.kind === "client") {
    if (c.id !== context.id) throw unavailable();
  } else {
    const link = (
      await p.find({
        collection: "crm-inquiry-links",
        where: {
          and: [
            { client: { equals: context.id } },
            { inquiry: { equals: c.id } },
            { active: { equals: true } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!link) throw unavailable();
    linkRevision = link.revision;
  }
  const anchor = await followupAnchor(p, actor, c, req);
  return { task, anchor, linkRevision };
}
export function taskContext(task: CrmFollowup): FollowupReadContext {
  const client = relationID(task.client),
    inquiry = relationID(task.inquiry);
  if (
    !Number.isSafeInteger(task.revision) ||
    task.revision < 1 ||
    !Number.isFinite(Date.parse(task.dueAt)) ||
    (task.anchorKind === "client" ? !client || inquiry : !inquiry || client)
  )
    throw new CrmError("跟进资料不可用", 503);
  return { kind: task.anchorKind, id: Number(task.anchorKind === "client" ? client : inquiry) };
}
export async function effectiveAssignee(
  p: Payload,
  anchor: Anchor,
  req: Partial<PayloadRequest>,
): Promise<number | null> {
  if (!anchor.ownerID || !anchor.teamID) return null;
  const staff = (
    await p.find({
      collection: "staff",
      where: { id: { equals: anchor.ownerID } },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  return validOwner(staff, anchor.teamID) ? Number(anchor.ownerID) : null;
}
export async function followupScope(
  p: Payload,
  actor: CrmActor,
  context: FollowupReadContext,
  req: Partial<PayloadRequest>,
): Promise<Where> {
  await followupAnchor(p, actor, context, req);
  if (context.kind === "inquiry") return { inquiry: { equals: context.id } };
  const links = await p.find({
    collection: "crm-inquiry-links",
    where: { and: [{ client: { equals: context.id } }, { active: { equals: true } }] },
    pagination: false,
    depth: 0,
    req,
  });
  const ids = links.docs.map((x) => relationID(x.inquiry));
  const inquiries = ids.length
    ? (
        await p.find({
          collection: "inquiries",
          where: { and: [inquiryFilter(actor), { id: { in: ids } }] },
          pagination: false,
          depth: 0,
          req,
        })
      ).docs.map((x) => x.id)
    : [];
  return { or: [{ client: { equals: context.id } }, { inquiry: { in: inquiries } }] };
}
