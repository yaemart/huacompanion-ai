import type { CollectionAfterChangeHook } from "payload";
import { isInquiryClosed } from "../../lib/inquiry-status";
import { transactionSession } from "../db-types";
import { appendFollowupEvent, followupState } from "./followup-events";
/** Native inquiry operations already lock business before reading; client writes use customerTransaction. */
export function followupLifecycle(kind: "client" | "inquiry"): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation, req }) => {
    if (operation !== "update" || !previousDoc) return doc;
    const closed = (v: typeof doc) =>
      kind === "client" ? v.status === "archived" : isInquiryClosed(v);
    if (closed(doc) === closed(previousDoc)) return doc;
    const tx = await req.transactionID;
    if (!tx) throw Error("Followup lifecycle requires transaction");
    await transactionSession(req.payload, tx).db.execute("SELECT pg_advisory_xact_lock(726281)");
    await transactionSession(req.payload, tx).db.execute("SELECT pg_advisory_xact_lock(726283)");
    const tasks = await req.payload.find({
      collection: "crm-followups",
      where: { and: [{ [kind]: { equals: doc.id } }, { state: { equals: "pending" } }] },
      pagination: false,
      depth: 0,
      req,
    });
    for (const task of tasks.docs) {
      const saved = await req.payload.update({
        collection: "crm-followups",
        id: task.id,
        req,
        data: { needsReview: true, revision: task.revision + 1 },
      });
      await appendFollowupEvent(
        req.payload,
        req,
        saved,
        closed(doc) ? "parent-suspended" : "parent-reopened",
        { before: followupState(task) },
      );
    }
    return doc;
  };
}
