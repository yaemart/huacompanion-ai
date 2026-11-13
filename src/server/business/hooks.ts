import type { CollectionBeforeChangeHook, CollectionAfterChangeHook } from "payload";
import { relationID } from "../../cms/access";
import { enqueueWorkflowEvent } from "../workflow/service";
import { transactionSession } from "../db-types";
export async function lockBusiness(req: Parameters<CollectionBeforeChangeHook>[0]["req"]) {
  const id = await req.transactionID;
  if (id)
    await transactionSession(req.payload, id)?.db.execute("SELECT pg_advisory_xact_lock(726281)");
}
export const businessLock: CollectionBeforeChangeHook = async ({ req, data }) => {
  await lockBusiness(req);
  return data;
};
export const inquiryWorkflowHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const owner = relationID(doc.owner),
    prior = relationID(previousDoc?.owner);
  const type =
    operation === "create"
      ? "inquiry-created"
      : String(owner) !== String(prior)
        ? "owner-changed"
        : null;
  if (type)
    await enqueueWorkflowEvent(
      req.payload,
      {
        key: `inquiry:${doc.id}:${type}:${doc.updatedAt}`,
        type,
        inquiry: doc.id,
        recipient: owner,
        title: type === "inquiry-created" ? "新客户咨询待受理" : "客户咨询负责人已变更",
        dueAt: doc.nextFollowUp || undefined,
      },
      req,
    );
  if (doc.nextFollowUp && doc.nextFollowUp !== previousDoc?.nextFollowUp)
    await enqueueWorkflowEvent(
      req.payload,
      {
        key: `inquiry:${doc.id}:followup:${doc.nextFollowUp}`,
        type: "case-stage",
        inquiry: doc.id,
        recipient: owner,
        title: "客户咨询待跟进",
        dueAt: doc.nextFollowUp,
      },
      req,
    );
  return doc;
};
export const supportWorkflowHook: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== "create" || doc.author !== "customer" || doc.visibility !== "public")
    return doc;
  const c = await req.payload.findByID({
    collection: "support-conversations",
    id: relationID(doc.conversation)!,
    depth: 0,
    req,
  });
  for (const link of (c.inquiryLinks as any[]) || []) {
    const q = (
      await req.payload.find({
        collection: "inquiries",
        where: { reference: { equals: link.reference } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (q)
      await enqueueWorkflowEvent(
        req.payload,
        {
          key: `support-message:${doc.id}:inquiry:${q.id}`,
          type: "customer-reply",
          inquiry: q.id,
          recipient: relationID(q.owner),
          title: "客户有新的客服消息",
        },
        req,
      );
  }
  return doc;
};
