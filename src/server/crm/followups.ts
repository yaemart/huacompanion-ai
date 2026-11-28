import { createHmac, randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type { CrmFollowup } from "../../../payload-types";
import { isManager, relationID } from "../../cms/access";
import { CrmError } from "../../lib/crm";
import {
  parseFollowupCommand,
  type FollowupDraft,
  type FollowupReceipt,
  type FollowupCommand,
  type Target,
} from "../../lib/crm-followups";
import { customerTransaction } from "../customer/service";
import { currentActor, type CrmActor } from "./access";
import {
  followupAnchor,
  followupTask,
  effectiveAssignee,
  followupConflict,
  taskContext,
  type Anchor,
} from "./followup-access";
import { appendFollowupEvent, followupState } from "./followup-events";
function childVersion(
  context: FollowupCommand["context"],
  target: Target,
  resolved: Awaited<ReturnType<typeof followupTask>>,
) {
  if (context.kind === "client" && resolved.anchor.version.kind === "inquiry") {
    if (
      target.expectedInquiryUpdatedAt !== resolved.anchor.version.updatedAt ||
      target.expectedLinkRevision !== resolved.linkRevision
    )
      throw followupConflict();
  } else if (
    target.expectedInquiryUpdatedAt !== undefined ||
    target.expectedLinkRevision !== undefined
  )
    throw new CrmError("该入口不接受咨询关联版本");
}
function version(actual: number, expected: number) {
  if (actual !== expected) throw followupConflict();
}
function verifyParent(anchor: Anchor, context: FollowupCommand["context"]) {
  if (JSON.stringify(anchor.version) !== JSON.stringify(context)) throw followupConflict();
  if (anchor.suspended) throw followupConflict();
}
async function assignee(
  p: Payload,
  actor: CrmActor,
  anchor: Anchor,
  value: number | null,
  req: Partial<PayloadRequest>,
) {
  const owner = await effectiveAssignee(p, anchor, req);
  if (
    value !== owner ||
    (value === null && !isManager(actor)) ||
    (!isManager(actor) && value !== Number(actor.id))
  )
    throw new CrmError("只能指派当前锚点的有效运营负责人", 403);
}
function manageable(actor: CrmActor) {
  if (!isManager(actor)) throw new CrmError("需要事项管理权限", 403);
}
async function executable(
  p: Payload,
  actor: CrmActor,
  anchor: Anchor,
  task: CrmFollowup,
  req: Partial<PayloadRequest>,
  review = false,
) {
  const effective = await effectiveAssignee(p, anchor, req);
  if (effective !== Number(actor.id) || relationID(task.assignee) !== effective)
    throw new CrmError("仅当前有效事项负责人可执行", 403);
  if (!review && task.needsReview) throw followupConflict();
}
async function createTask(
  p: Payload,
  actor: CrmActor,
  anchor: Anchor,
  data: FollowupDraft,
  req: Partial<PayloadRequest>,
) {
  if (anchor.suspended) throw followupConflict();
  await assignee(p, actor, anchor, data.assigneeID, req);
  const count = await p.count({
    collection: "crm-followups",
    where: { and: [{ [anchor.kind]: { equals: anchor.id } }, { state: { equals: "pending" } }] },
    req,
  });
  if (count.totalDocs >= 50) throw new CrmError("该记录最多保留50个待办事项", 409);
  return p.create({
    collection: "crm-followups",
    req,
    data: {
      reference: `FUP-${randomUUID()}`,
      anchorKind: anchor.kind,
      [anchor.kind]: anchor.id,
      type: "adhoc",
      title: data.title,
      description: data.description,
      dueAt: data.dueAt,
      assignee: data.assigneeID,
      state: "pending",
      needsReview: false,
      revision: 1,
      createdBy: Number(actor.id),
    },
  });
}
function signature(p: Payload, input: FollowupCommand) {
  const hmac = (s: string) => createHmac("sha256", p.secret).update(s).digest("hex");
  return {
    epoch: hmac("crm-epoch-v1"),
    inputDigest: hmac("crm-followup-input-v1:" + JSON.stringify(input)),
  };
}
function validReceipt(value: unknown, key: string): value is FollowupReceipt {
  if (!value || typeof value !== "object") return false;
  const r = value as FollowupReceipt;
  return (
    r.kind === "followup" &&
    r.operationKey === key &&
    Array.isArray(r.tasks) &&
    r.tasks.length > 0 &&
    r.tasks.length <= 20 &&
    Array.isArray(r.eventIDs) &&
    r.eventIDs.length === r.tasks.length &&
    r.changedCount === r.tasks.length &&
    new Set(r.tasks.map((t) => t.taskID)).size === r.tasks.length &&
    r.tasks.every(
      (t) =>
        Number.isSafeInteger(t.taskID) &&
        t.taskID > 0 &&
        Number.isSafeInteger(t.revision) &&
        t.revision > 0,
    ) &&
    r.eventIDs.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}
export async function executeFollowup(
  p: Payload,
  user: CrmActor,
  raw: unknown,
): Promise<FollowupReceipt> {
  const input = parseFollowupCommand(raw);
  return customerTransaction(
    p,
    async (req) => {
      const actor = await currentActor(p, user, req);
      req.user = { ...actor, collection: "staff" };
      const anchor = await followupAnchor(p, actor, input.context, req);
      if (
        input.action === "assignFollowups" ||
        ((input.action === "cancelFollowup" || input.action === "appendFollowupNote") &&
          input.management)
      )
        manageable(actor);
      const key = `${actor.id}:${input.operationKey}`,
        proof = signature(p, input);
      const old = (
        await p.find({
          collection: "crm-operations",
          where: { key: { equals: key } },
          limit: 1,
          depth: 0,
          req,
        })
      ).docs[0];
      if (old) {
        if (
          old.action !== input.action ||
          old.epoch !== proof.epoch ||
          old.inputDigest !== proof.inputDigest
        )
          throw followupConflict();
        if (!validReceipt(old.result, input.operationKey))
          throw new CrmError("事项回执不可用", 503);
        for (const t of old.result.tasks)
          await followupTask(p, actor, input.context, t.taskID, req);
        return old.result;
      }
      verifyParent(anchor, input.context);
      const receipt: FollowupReceipt = {
        kind: "followup",
        operationKey: input.operationKey,
        tasks: [],
        eventIDs: [],
        changedCount: 0,
      };
      const record = async (
        task: CrmFollowup,
        action: string,
        details: Record<string, unknown>,
      ) => {
        receipt.tasks.push({ taskID: task.id, revision: task.revision });
        receipt.eventIDs.push(await appendFollowupEvent(p, req, task, action, details));
        receipt.changedCount++;
      };
      if (input.action === "createFollowup") {
        const task = await createTask(p, actor, anchor, input, req);
        await record(task, "created", {});
      } else if (input.action === "assignFollowups") {
        for (const choice of input.tasks) {
          const resolved = await followupTask(p, actor, input.context, choice.taskID, req);
          childVersion(input.context, choice, resolved);
          const { task, anchor: own } = resolved;
          if (task.type !== "adhoc" || task.state !== "pending" || own.suspended)
            throw followupConflict();
          version(task.revision, choice.expectedRevision);
          await assignee(p, actor, own, input.assigneeID, req);
          if (relationID(task.assignee) === input.assigneeID) continue;
          const saved = await p.update({
            collection: "crm-followups",
            id: task.id,
            req,
            data: { assignee: input.assigneeID, revision: task.revision + 1 },
          });
          await record(saved, "assigned", { before: followupState(task) });
        }
        if (!receipt.changedCount) throw followupConflict();
      } else {
        const resolved = await followupTask(p, actor, input.context, input.taskID, req);
        childVersion(input.context, input, resolved);
        const { task, anchor: own } = resolved;
        if (task.type !== "adhoc" || own.suspended || task.state !== "pending")
          throw followupConflict();
        version(task.revision, input.expectedRevision);
        const management =
          (input.action === "cancelFollowup" || input.action === "appendFollowupNote") &&
          input.management;
        if (!management)
          await executable(p, actor, own, task, req, input.action === "confirmFollowupReview");
        const changes: Partial<CrmFollowup> = { revision: task.revision + 1 };
        const details: Record<string, unknown> = { before: followupState(task) };
        if (input.action === "confirmFollowupReview") {
          if (!task.needsReview) throw followupConflict();
          changes.needsReview = false;
        } else if (input.action === "postponeFollowup") {
          if (task.dueAt === input.dueAt) throw followupConflict();
          changes.dueAt = input.dueAt;
          details.reason = input.reason;
        } else if (input.action === "appendFollowupNote") {
          details.body = input.body;
        } else {
          changes.state = input.action === "completeFollowup" ? "completed" : "canceled";
          changes.terminalAt = new Date().toISOString();
          changes.terminalBy = Number(actor.id);
          if (input.action === "cancelFollowup") details.reason = input.reason;
          else {
            details.body = input.body;
            if (input.continuation.kind === "existing") {
              const next = await followupTask(
                p,
                actor,
                input.context,
                input.continuation.taskID,
                req,
              );
              childVersion(input.context, input.continuation, next);
              version(next.task.revision, input.continuation.expectedRevision);
              if (
                next.task.id === task.id ||
                next.task.state !== "pending" ||
                next.task.needsReview ||
                next.anchor.suspended ||
                JSON.stringify(taskContext(next.task)) !== JSON.stringify(taskContext(task)) ||
                relationID(next.task.assignee) !== (await effectiveAssignee(p, next.anchor, req))
              )
                throw followupConflict();
              details.continuationTaskID = next.task.id;
            } else if (input.continuation.kind === "end")
              details.endReason = input.continuation.reason;
          }
        }
        const saved = await p.update({
          collection: "crm-followups",
          id: task.id,
          req,
          data: changes,
        });
        await record(
          saved,
          management
            ? `management-${input.action === "cancelFollowup" ? "canceled" : "note"}`
            : input.action,
          details,
        );
        if (input.action === "completeFollowup" && input.continuation.kind === "create") {
          const next = await createTask(p, actor, own, input.continuation, req);
          await record(next, "created", { previousTaskID: task.id });
        }
      }
      await p.create({
        collection: "crm-operations",
        req,
        data: {
          actor: Number(actor.id),
          key,
          operationKey: input.operationKey,
          action: input.action,
          ...proof,
          result: { ...receipt },
        },
      });
      return receipt;
    },
    { readCommitted: true },
  );
}
