import type { Payload, PayloadRequest } from "payload";
import type { PolicyGroup, WorkflowTask } from "../../../payload-types";
import { canAccessContentKind, relationID } from "../../cms/access";
import { contentTransaction } from "../content/service";
import { transactionSession } from "../db-types";
function history(task: WorkflowTask, action: string, reason: string) {
  const prior = Array.isArray(task.history) ? task.history : [];
  return [...prior, { action, at: new Date().toISOString(), reason }];
}
export async function syncSharedNoteTasks(
  p: Payload,
  req: Partial<PayloadRequest>,
  group: PolicyGroup,
  version: number | null,
) {
  const drafts = (
    await p.find({
      collection: "policy-note-drafts",
      req: { ...req },
      depth: 0,
      pagination: false,
      where: { group: { equals: group.id } },
    })
  ).docs;
  for (const d of drafts)
    await p.update({
      collection: "policy-note-drafts",
      id: d.id,
      req: { ...req },
      data: {
        needsReview: true,
        reviewState: "draft",
        revision: d.revision + 1,
        reviewNote: "事实版本已变更，请按当前正式事实重新复核并提交说明",
      },
    });
  const tasks = (
    await p.find({
      collection: "workflow-tasks",
      req: { ...req },
      depth: 0,
      pagination: false,
      where: { policyGroup: { equals: group.id } },
    })
  ).docs;
  const keys = version
    ? ["zh", "en"].map((locale) => `policy-note-review:${group.id}:${locale}:${version}`)
    : [];
  for (const task of tasks)
    if (task.status === "open" && !keys.includes(task.key)) {
      await p.update({
        collection: "workflow-tasks",
        id: task.id,
        req: { ...req },
        data: {
          status: "done",
          history: history(task, "system-close", "正式事实已变更或下架，旧复核任务失效"),
        },
      });
    }
  for (const key of keys)
    if (!tasks.some((t) => t.key === key)) {
      const locale = key.split(":")[2] === "zh" ? "中文" : "英文";
      await p.create({
        collection: "workflow-tasks",
        req: { ...req },
        data: {
          key,
          policyGroup: group.id,
          title: `政策说明待复核（${locale}）：${group.contentKey}`,
          status: "open",
          history: [
            {
              action: "policy-note-review-created",
              at: new Date().toISOString(),
              factVersion: version,
            },
          ],
        },
      });
    }
}
/** Same content -> staff lock order as fact publication; no mail enqueue or worker startup. */
export async function refreshSharedNoteAssignees(p: Payload) {
  return contentTransaction(p, async (req) => {
    await transactionSession(p, req.transactionID).db.execute(
      "SELECT pg_advisory_xact_lock(726281)",
    );
    const tasks = (
      await p.find({
        collection: "workflow-tasks",
        req: { ...req },
        depth: 0,
        pagination: false,
        where: {
          and: [
            { policyGroup: { exists: true } },
            { status: { equals: "open" } },
            { assignee: { exists: true } },
          ],
        },
      })
    ).docs;
    for (const task of tasks) {
      const person = await p
        .findByID({
          collection: "staff",
          id: relationID(task.assignee)!,
          req: { ...req },
          depth: 0,
        })
        .catch(() => null);
      if (canAccessContentKind(person, "immigration-policy")) continue;
      await p.update({
        collection: "workflow-tasks",
        id: task.id,
        req: { ...req },
        data: {
          assignee: null,
          history: history(task, "system-unassign", "负责人停用或失去政策板块权限"),
        },
      });
    }
  });
}
