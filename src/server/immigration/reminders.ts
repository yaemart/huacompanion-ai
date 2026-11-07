import type { Payload } from "payload";
import { canAccessContentKind, relationID } from "../../cms/access";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { validatePublicPolicy } from "../../lib/immigration-policy";
import { policyReminderKey, policyReminderWindows } from "../../lib/immigration-reminders";
import { contentTransaction } from "../content/service";
import { transactionSession } from "../db-types";

/** Internal only. Formal snapshots, not editable policy masters, determine due dates. */
export async function runPolicyReminders(
  p: Payload,
  today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()),
) {
  if (!visaCheckerEnabled()) return { queued: 0 };
  return contentTransaction(p, async (tx) => {
    await transactionSession(p, tx.transactionID).db.execute(
      "SELECT pg_advisory_xact_lock(726281)",
    );
    const req = () => ({ ...tx });
    const settings = await p.findGlobal({ slug: "workflow-settings", req: req() });
    const createEnabled = !settings.enabledEvents || settings.enabledEvents.includes("quality-due");
    const snapshots = (
      await p.find({
        collection: "content-published",
        depth: 0,
        pagination: false,
        where: { active: { equals: true } },
        req: req(),
      })
    ).docs;
    const tasks = (
      await p.find({
        collection: "workflow-tasks",
        depth: 0,
        pagination: false,
        where: { key: { like: "policy-review:%" } },
        req: req(),
      })
    ).docs;
    const currentKeys = new Set<string>();
    let queued = 0;
    async function eligible(id: number | string | undefined) {
      if (!id) return undefined;
      const person = await p
        .findByID({ collection: "staff", id, depth: 0, req: req() })
        .catch(() => null);
      return canAccessContentKind(person, "immigration-policy") ? person!.id : undefined;
    }
    for (const snapshot of snapshots) {
      const body = snapshot.body;
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        body.kind !== "immigration-policy"
      )
        continue;
      try {
        validatePublicPolicy(body.policy, today);
      } catch {
        continue;
      }
      const policy = body.policy;
      const windows = policyReminderWindows(policy.validUntil, today);
      if (!windows.length || !policy.validUntil) continue;
      const draft = await p
        .findByID({ collection: "content-drafts", id: snapshot.draftId, depth: 0, req: req() })
        .catch(() => null);
      if (!draft || draft.kind !== "immigration-policy") continue;
      const quality = (
        await p.find({
          collection: "content-quality",
          limit: 1,
          depth: 0,
          where: { draftId: { equals: draft.id } },
          req: req(),
        })
      ).docs[0];
      const owner = await eligible(relationID(quality?.owner));
      const latest = windows[windows.length - 1];
      for (const days of windows) {
        const key = policyReminderKey(draft.id, snapshot.revision, policy.validUntil, days);
        if (days === latest) currentKeys.add(key);
        const old = tasks.find((t) => t.key === key);
        if (old) {
          if (
            old.status === "open" &&
            relationID(old.assignee) &&
            !(await eligible(relationID(old.assignee)))
          ) {
            const updated = await p.update({
              collection: "workflow-tasks",
              id: old.id,
              req: req(),
              data: {
                assignee: null,
                history: [
                  ...(Array.isArray(old.history) ? old.history : []),
                  {
                    action: "system-unassign",
                    at: new Date().toISOString(),
                    reason: "负责人停用或失去政策板块权限",
                  },
                ],
              },
            });
            Object.assign(old, updated);
          }
          continue;
        }
        if (!createEnabled) continue;
        const title = `政策到期复核（${days}天）：${draft.title}；正式版本 ${snapshot.revision}；截止 ${policy.validUntil}`;
        const dueAt = `${policy.validUntil}T23:59:59+08:00`;
        const event = await p.create({
          collection: "workflow-events",
          req: req(),
          data: {
            key,
            type: "quality-due",
            contentDraft: draft.id,
            recipient: owner,
            title,
            dueAt,
          },
        });
        await p.create({
          collection: "workflow-tasks",
          req: req(),
          data: {
            key,
            contentDraft: draft.id,
            assignee: owner,
            title,
            dueAt,
            status: days === latest ? "open" : "done",
            history: [
              {
                action: days === latest ? "policy-review-created" : "system-close",
                at: new Date().toISOString(),
                revision: snapshot.revision,
                validUntil: policy.validUntil,
                threshold: days,
                reason: days === latest ? "待人工核实，不自动修改政策" : "补跑时已进入7天窗口",
              },
            ],
          },
        });
        // Deliberately bypass mail enqueue: these reminders are always in-app only.
        if (owner && days === latest)
          await p.create({
            collection: "workflow-notifications",
            req: req(),
            data: {
              key: `${key}:${owner}`,
              event: event.id,
              contentDraft: draft.id,
              recipient: owner,
              title,
            },
          });
        queued++;
      }
    }
    for (const task of tasks) {
      if (
        !task.key.startsWith("policy-review:") ||
        task.status !== "open" ||
        currentKeys.has(task.key)
      )
        continue;
      await p.update({
        collection: "workflow-tasks",
        id: task.id,
        req: req(),
        data: {
          status: "done",
          history: [
            ...(Array.isArray(task.history) ? task.history : []),
            {
              action: "system-close",
              at: new Date().toISOString(),
              reason: "正式政策已下架、变更或进入新提醒窗口",
            },
          ],
        },
      });
    }
    return { queued };
  });
}
