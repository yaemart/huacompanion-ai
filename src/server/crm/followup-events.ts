import type { Payload, PayloadRequest } from "payload";
import type { CrmFollowup } from "../../../payload-types";
import { relationID } from "../../cms/access";
export function followupState(task: CrmFollowup) {
  return {
    revision: task.revision,
    state: task.state,
    dueAt: task.dueAt,
    assigneeID: relationID(task.assignee) ?? null,
    needsReview: task.needsReview,
  };
}
export async function appendFollowupEvent(
  p: Payload,
  req: Partial<PayloadRequest>,
  task: CrmFollowup,
  action: string,
  details: Record<string, unknown>,
) {
  if (!req.user || req.user.collection !== "staff") throw Error("Followup actor required");
  const event = await p.create({
    collection: "crm-followup-events",
    req,
    data: {
      task: task.id,
      seq: task.revision,
      action,
      actor: req.user.id,
      serverTime: new Date().toISOString(),
      details: { ...details, after: followupState(task) },
    },
  });
  await p.create({
    collection: "audit-events",
    req,
    data: {
      entity: "crm",
      recordId: String(task.id),
      action: `followup:${action}`,
      actor: req.user.id,
      fields: "followup",
      before: { revision: task.revision - 1 },
      after: { taskID: task.id, revision: task.revision, eventID: event.id },
    },
  });
  return event.id;
}
