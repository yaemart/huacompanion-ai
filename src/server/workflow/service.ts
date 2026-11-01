import { randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import { isActiveStaff, isManager, isAdmin, relationID } from "../../cms/access";
import { postponeDate, reminderKey, workflowEventTypes } from "../../lib/workflow";
import { sendConfiguredMail } from "./mail";
import { customerOwnsInquiry } from "../customer/service";
import { customerNotificationText } from "../../lib/workflow";
export type WorkflowEvent = {
  key: string;
  type: (typeof workflowEventTypes)[number];
  inquiry?: string | number;
  contentDraft?: string | number;
  recipient?: string | number;
  title: string;
  dueAt?: string;
};
async function unique(
  p: any,
  collection: string,
  key: string,
  data: any,
  req?: Partial<PayloadRequest>,
) {
  const old = (await p.find({ collection, where: { key: { equals: key } }, limit: 1, req }))
    .docs[0];
  if (old) return old;
  try {
    return await p.create({ collection, data: { key, ...data }, req });
  } catch (error) {
    const raced = (await p.find({ collection, where: { key: { equals: key } }, limit: 1, req }))
      .docs[0];
    if (raced) return raced;
    throw error;
  }
}
async function visible(p: any, user: any, doc: any) {
  if (!isActiveStaff(user)) return false;
  const inquiry = relationID(doc.inquiry),
    draft = relationID(doc.contentDraft);
  try {
    if (inquiry !== undefined) {
      await p.findByID({
        collection: "inquiries",
        id: inquiry,
        user,
        overrideAccess: false,
        depth: 0,
      });
      return true;
    }
    if (draft !== undefined) {
      await p.findByID({
        collection: "content-drafts",
        id: draft,
        user,
        overrideAccess: false,
        depth: 0,
      });
      return true;
    }
    return isAdmin(user);
  } catch {
    return false;
  }
}
export async function enqueueWorkflowEvent(
  payload: Payload,
  event: WorkflowEvent,
  req?: Partial<PayloadRequest>,
) {
  const p = payload as any;
  const settings = await p.findGlobal({ slug: "workflow-settings", req });
  const enabled = !settings.enabledEvents || settings.enabledEvents.includes(event.type);
  const e = await unique(p, "workflow-events", event.key, event, req);
  let recipient = event.recipient;
  if (!recipient && event.inquiry) {
    const inquiry = await p.findByID({ collection: "inquiries", id: event.inquiry, depth: 0, req });
    recipient = relationID(inquiry.owner);
  }
  if (event.inquiry && ["quote-sent", "quote-confirmed"].includes(event.type)) {
    let page = 1;
    for (;;) {
      const oldEvents = await p.find({
        collection: "workflow-events",
        where: {
          and: [
            { inquiry: { equals: event.inquiry } },
            { type: { equals: "quote-sent" } },
            { id: { less_than: e.id } },
          ],
        },
        limit: 100,
        page,
        depth: 0,
        req,
      });
      for (const old of oldEvents.docs) {
        const tasks = await p.find({
          collection: "workflow-tasks",
          where: { and: [{ key: { equals: old.key } }, { status: { equals: "open" } }] },
          limit: 100,
          depth: 0,
          req,
        });
        for (const task of tasks.docs)
          await p.update({
            collection: "workflow-tasks",
            id: task.id,
            data: {
              status: "done",
              history: [
                ...(Array.isArray(task.history) ? task.history : []),
                {
                  at: new Date().toISOString(),
                  action: "system-close",
                  reason: event.type === "quote-confirmed" ? "系统已确认" : "新版替代",
                  event: event.key,
                },
              ],
            },
            req,
          });
      }
      if (!oldEvents.hasNextPage) break;
      page++;
    }
  }
  if (!enabled) return e;
  if (
    ["inquiry-created", "owner-changed", "customer-reply", "quality-due"].includes(event.type) ||
    (event.dueAt && !["task-due", "task-escalated"].includes(event.type))
  )
    await unique(
      p,
      "workflow-tasks",
      event.key,
      {
        inquiry: event.inquiry,
        contentDraft: event.contentDraft,
        assignee: recipient,
        title: event.title,
        dueAt: event.dueAt,
        status: "open",
        history: [],
      },
      req,
    );
  if (event.inquiry && ["quote-sent", "quote-confirmed", "case-stage"].includes(event.type)) {
    let page = 1;
    for (;;) {
      const links = await p.find({
        collection: "customer-inquiry-links",
        where: { and: [{ inquiry: { equals: event.inquiry } }, { active: { equals: true } }] },
        limit: 100,
        page,
        depth: 0,
        req,
      });
      for (const link of links.docs) {
        const customer = await p.findByID({
          collection: "customer-accounts",
          id: relationID(link.customer),
          depth: 0,
          req,
        });
        if (!customer.active || !customer.verifiedAt) continue;
        const notification = await unique(
          p,
          "workflow-customer-notifications",
          `${event.key}:customer:${customer.id}`,
          {
            customer: customer.id,
            inquiry: event.inquiry,
            type: event.type,
            title: "Business update",
          },
          req,
        );
        if (settings.emailEnabled)
          await unique(
            p,
            "workflow-mail-jobs",
            `customer-notification:${notification.id}`,
            {
              customerNotification: notification.id,
              status: "queued",
              attempts: 0,
              nextAt: new Date().toISOString(),
            },
            req,
          );
      }
      if (!links.hasNextPage) break;
      page++;
    }
  }
  if (!recipient) return e;
  const n = await unique(
    p,
    "workflow-notifications",
    `${event.key}:${recipient}`,
    {
      event: e.id,
      inquiry: event.inquiry,
      contentDraft: event.contentDraft,
      recipient,
      title: event.title,
    },
    req,
  );
  if (settings.emailEnabled)
    await unique(
      p,
      "workflow-mail-jobs",
      `notification:${n.id}`,
      { notification: n.id, status: "queued", attempts: 0, nextAt: new Date().toISOString() },
      req,
    );
  return e;
}
export async function customerWorkflowRead(
  payload: Payload,
  customer: any,
  req?: Partial<PayloadRequest>,
) {
  const p = payload as any;
  const notifications = [];
  let page = 1;
  for (;;) {
    const result = await p.find({
      collection: "workflow-customer-notifications",
      where: { customer: { equals: customer.id } },
      sort: "-createdAt",
      limit: 100,
      page,
      depth: 0,
      req,
    });
    for (const n of result.docs) {
      try {
        await customerOwnsInquiry(p, customer, relationID(n.inquiry), req);
      } catch {
        continue;
      }
      notifications.push({
        id: n.id,
        type: n.type,
        inquiry: relationID(n.inquiry),
        title: n.title,
        readAt: n.readAt,
        createdAt: n.createdAt,
      });
    }
    if (!result.hasNextPage) break;
    page++;
  }
  return notifications;
}
export async function customerWorkflowMarkRead(
  payload: Payload,
  customer: any,
  id: string | number,
  req?: Partial<PayloadRequest>,
) {
  const p = payload as any;
  const n = await p.findByID({ collection: "workflow-customer-notifications", id, depth: 0, req });
  if (String(relationID(n.customer)) !== String(customer.id)) throw Error("Forbidden");
  await customerOwnsInquiry(p, customer, relationID(n.inquiry), req);
  await p.update({
    collection: "workflow-customer-notifications",
    id,
    data: { readAt: new Date().toISOString() },
    req,
  });
  return { ok: true };
}
export async function workflowRead(payload: Payload, user: any) {
  if (!isActiveStaff(user)) throw Error("Unauthorized");
  const p = payload as any;
  const notifications: any[] = [],
    tasks: any[] = [];
  for (const [collection, target] of [
    ["workflow-notifications", notifications],
    ["workflow-tasks", tasks],
  ] as const) {
    let page = 1;
    for (;;) {
      const result = await p.find({ collection, limit: 100, page, depth: 0, sort: "-createdAt" });
      for (const d of result.docs) {
        if (
          collection === "workflow-notifications" &&
          String(relationID(d.recipient)) !== String(user.id)
        )
          continue;
        if (await visible(p, user, d))
          target.push({
            id: d.id,
            title: d.title,
            inquiry: relationID(d.inquiry),
            contentDraft: relationID(d.contentDraft),
            assignee: relationID(d.assignee),
            status: d.status,
            dueAt: d.dueAt,
            readAt: d.readAt,
            createdAt: d.createdAt,
            history: d.history,
          });
      }
      if (!result.hasNextPage) break;
      page++;
    }
  }
  const mailJobs = isAdmin(user)
    ? (
        await p.find({
          collection: "workflow-mail-jobs",
          where: { status: { not_equals: "sent" } },
          limit: 100,
          sort: "-createdAt",
          depth: 0,
        })
      ).docs.map((j: any) => ({
        id: j.id,
        status: j.status,
        attempts: j.attempts,
        nextAt: j.nextAt,
        createdAt: j.createdAt,
        canRetry: canRetryMail(j),
      }))
    : [];
  return { notifications, tasks, mailJobs, userID: user.id, canAssign: isManager(user) };
}
export async function workflowAction(payload: Payload, user: any, input: any) {
  if (!isActiveStaff(user)) throw Error("Unauthorized");
  if (input.action === "retry-mail") {
    const fresh = await (payload as any).findByID({ collection: "staff", id: user.id, depth: 0 });
    if (!isAdmin(fresh)) throw Error("Forbidden");
    await updateMailJob(payload, input.id, (current) => {
      if (!canRetryMail(current)) throw Error("该邮件不能安全重试，请在供应商后台核实");
      return {
        status: "queued",
        attempts: 0,
        nextAt: new Date().toISOString(),
        lease: null,
        leaseUntil: null,
      };
    });
    return { ok: true };
  }
  const id = await payload.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    await (payload.db.sessions as any)[id].db.execute("SELECT pg_advisory_xact_lock(726281)");
    const p: any = {
      findByID: (args: any) => (payload as any).findByID({ ...args, req: { transactionID: id } }),
      update: (args: any) => (payload as any).update({ ...args, req: { transactionID: id } }),
    };
    const fresh = await p.findByID({ collection: "staff", id: user?.id, depth: 0 });
    const result = await actionWithinTransaction(p, fresh, input);
    await payload.db.commitTransaction(id);
    return result;
  } catch (error) {
    await payload.db.rollbackTransaction(id);
    throw error;
  }
}
async function actionWithinTransaction(p: any, user: any, input: any) {
  if (!isActiveStaff(user)) throw Error("Unauthorized");
  const collection = input.action === "read" ? "workflow-notifications" : "workflow-tasks";
  const d = await p.findByID({ collection, id: input.id, depth: 0 });
  if (!(await visible(p, user, d))) throw Error("Forbidden");
  if (input.action === "read") {
    if (String(relationID(d.recipient)) !== String(user.id)) throw Error("Forbidden");
    await p.update({ collection, id: d.id, data: { readAt: new Date().toISOString() } });
    return { ok: true };
  }
  let data: any = {};
  if (d.status === "done") throw Error("任务已完成");
  if (input.action === "assign") {
    if (!isManager(user)) throw Error("Forbidden");
    const staff = await p.findByID({ collection: "staff", id: input.assignee, depth: 0 });
    if (!(await visible(p, staff, d))) throw Error("负责人无法访问此记录");
    data.assignee = staff.id;
  } else if (input.action === "claim") {
    if (relationID(d.assignee)) throw Error("已有负责人");
    data.assignee = user.id;
  } else {
    if (String(relationID(d.assignee)) !== String(user.id) && !isManager(user))
      throw Error("Forbidden");
    if (input.action === "done") data.status = "done";
    else if (input.action === "postpone") data.dueAt = postponeDate(input.dueAt, input.reason);
    else throw Error("无效操作");
  }
  data.history = [
    ...(Array.isArray(d.history) ? d.history : []),
    {
      at: new Date().toISOString(),
      actor: user.id,
      action: input.action,
      reason: input.action === "postpone" ? input.reason : undefined,
      assignee: data.assignee,
      dueAt: data.dueAt,
    },
  ];
  const result = await p.update({
    collection,
    where: { and: [{ id: { equals: d.id } }, { updatedAt: { equals: d.updatedAt } }] },
    data,
  });
  if (!result.docs.length) throw Error("任务已变更，请刷新重试");
  return { ok: true };
}
function canRetryMail(job: any) {
  return (
    ["failed", "uncertain", "disabled", "retry"].includes(job.status) &&
    Date.now() - Date.parse(job.createdAt) < 23 * 3600000
  );
}
async function updateMailJob(payload: Payload, id: string | number, change: (job: any) => any) {
  const tx = await payload.db.beginTransaction();
  if (!tx) throw Error("Transaction required");
  const p = payload as any,
    req = { transactionID: tx };
  try {
    await (payload.db.sessions as any)[tx].db.execute("SELECT pg_advisory_xact_lock(726282)");
    const job = await p.findByID({ collection: "workflow-mail-jobs", id, depth: 0, req });
    const data = change(job);
    if (data) await p.update({ collection: "workflow-mail-jobs", id, data, req });
    await payload.db.commitTransaction(tx);
    return !!data;
  } catch (error) {
    await payload.db.rollbackTransaction(tx);
    throw error;
  }
}
export async function runWorkflowJobs(payload: Payload) {
  const p = payload as any;
  const now = new Date();
  const settings = await p.findGlobal({ slug: "workflow-settings" });
  let reminders = 0,
    processed = 0;
  let taskPage = 1;
  for (;;) {
    const due = await p.find({
      collection: "workflow-tasks",
      where: {
        and: [{ status: { equals: "open" } }, { dueAt: { less_than_equal: now.toISOString() } }],
      },
      limit: 100,
      page: taskPage,
      depth: 0,
      sort: "dueAt",
    });
    for (const t of due.docs) {
      const event = {
        key: reminderKey(t.id, t.dueAt),
        type: "task-due" as const,
        inquiry: relationID(t.inquiry),
        contentDraft: relationID(t.contentDraft),
        recipient: relationID(t.assignee),
        title: `待办到期：${t.title}`,
      };
      await enqueueWorkflowEvent(payload, event);
      reminders++;
      if (
        settings.escalationEnabled &&
        Date.parse(t.dueAt) + (settings.escalationHours || 24) * 3600000 <= now.getTime()
      ) {
        const managers = await p.find({
          collection: "staff",
          where: {
            or: [
              { role: { in: ["admin", "manager"] } },
              { additionalRoles: { contains: "manager" } },
            ],
          },
          limit: 100,
          depth: 0,
        });
        for (const m of managers.docs)
          if (await visible(p, m, t))
            await enqueueWorkflowEvent(payload, {
              ...event,
              key: reminderKey(t.id, t.dueAt, `escalation:${m.id}`),
              type: "task-escalated",
              recipient: m.id,
              title: `逾期待办：${t.title}`,
            });
      }
    }
    if (!due.hasNextPage) break;
    taskPage++;
  }
  const jobs = await p.find({
    collection: "workflow-mail-jobs",
    where: {
      or: [
        {
          and: [
            { status: { in: ["queued", "retry", "uncertain"] } },
            { nextAt: { less_than_equal: now.toISOString() } },
          ],
        },
        {
          and: [
            { status: { equals: "running" } },
            { leaseUntil: { less_than: now.toISOString() } },
          ],
        },
      ],
    },
    limit: 25,
    depth: 0,
  });
  for (const j of jobs.docs) {
    const lease = randomUUID();
    const claimed = await updateMailJob(payload, j.id, (current) => {
      if (current.updatedAt !== j.updatedAt) return null;
      return {
        status: "running",
        lease,
        leaseUntil: new Date(Date.now() + 60000).toISOString(),
        attempts: (current.attempts || 0) + 1,
      };
    });
    if (!claimed) continue;
    let result: any = { status: "failed" };
    // Never retry beyond provider's 24-hour idempotency window; uncertain delivery needs manual review.
    if (Date.now() - Date.parse(j.createdAt) > 23 * 3600000 || j.attempts >= 5)
      result = {
        status: j.status === "uncertain" || j.status === "running" ? "uncertain" : "failed",
      };
    else {
      try {
        if (j.customerNotification) {
          const n = await p.findByID({
            collection: "workflow-customer-notifications",
            id: relationID(j.customerNotification),
            depth: 0,
          });
          const customer = await p.findByID({
            collection: "customer-accounts",
            id: relationID(n.customer),
            depth: 0,
          });
          let allowed = false;
          try {
            await customerOwnsInquiry(p, customer, relationID(n.inquiry));
            allowed = true;
          } catch {}
          if (!settings.emailEnabled || !allowed) result = { status: "disabled" };
          else {
            const inquiry = await p.findByID({
              collection: "inquiries",
              id: relationID(n.inquiry),
              depth: 0,
            });
            const copy = customerNotificationText(inquiry.locale);
            const origin = process.env.APP_URL;
            const link =
              origin && /^https?:\/\//.test(origin)
                ? new URL(`/${copy.locale}/account`, origin).toString()
                : `/${copy.locale}/account`;
            result = await sendConfiguredMail({
              to: customer.email,
              subject: copy.subject,
              text: `${copy.text}\n${link}`,
              idempotencyKey: j.key,
            });
          }
        } else {
          const n = await p.findByID({
            collection: "workflow-notifications",
            id: relationID(j.notification),
            depth: 0,
          });
          const staff = await p.findByID({
            collection: "staff",
            id: relationID(n.recipient),
            depth: 0,
          });
          result =
            !settings.emailEnabled || !(await visible(p, staff, n))
              ? { status: "disabled" }
              : await sendConfiguredMail({
                  to: staff.email,
                  subject: "华伴待办提醒",
                  text: "您有新的站内通知，请登录华伴工作台查看。",
                  idempotencyKey: j.key,
                });
        }
      } catch {
        result = { status: "retry" };
      }
    }
    const terminal = j.attempts >= 5 || Date.now() - Date.parse(j.createdAt) > 23 * 3600000;
    await updateMailJob(payload, j.id, (current) =>
      current.lease === lease
        ? {
            status: result.status,
            providerId: result.providerId,
            lease: null,
            leaseUntil: null,
            nextAt: terminal
              ? null
              : new Date(
                  Date.now() +
                    Math.max(
                      result.retryAfterMs || 0,
                      Math.min(3600000, 30000 * 2 ** (j.attempts || 0)),
                    ),
                ).toISOString(),
          }
        : null,
    );
    processed++;
  }
  return { reminders, processed };
}
