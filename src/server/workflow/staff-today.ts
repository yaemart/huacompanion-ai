import type { Payload } from "payload";
import {
  canAccessContentKind,
  canReviewContent,
  contentScope,
  inquiryScope,
  isActiveStaff,
  isManager,
  relationID,
  type Staff,
} from "../../cms/access";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { sharedPolicyForm } from "../../lib/policy-shared-form";
import { chinaDay, sortToday, type TodayItem } from "../../lib/staff-today";
import { readQuoteNoticeSettings, quoteNoticesCurrent } from "../business/quote-notices";
import { ContentError } from "../content/error";
import { visible as workflowSourceVisible } from "./service";

const query = { depth: 0, pagination: false } as const;
const reviewState = { equals: "review" };
const contributors = { contributors: true, lastEditedBy: true, submittedBy: true } as const;

export async function readStaffToday(p: Payload, user: Staff, now = Date.now()) {
  if (!isActiveStaff(user)) throw new ContentError("请先登录员工账号", 403);
  const actor = await p.findByID({ collection: "staff", id: user!.id, depth: 0 });
  if (!isActiveStaff(actor)) throw new ContentError("员工账号已停用", 403);
  const { date, end } = chinaDay(now);
  const access = { ...query, user: actor, overrideAccess: false } as const;
  const items: TodayItem[] = [];
  const canReview = canReviewContent(actor) && contentScope(actor) !== false;
  const policy = visaCheckerEnabled() && canAccessContentKind(actor, "immigration-policy");
  const legacyPolicy = policy && !(await p.count({ collection: "policy-groups" })).totalDocs;
  const [inquiries, drafts, facts, notes, tasks] = await Promise.all([
    inquiryScope(actor) !== false
      ? p
          .find({
            ...access,
            collection: "inquiries",
            where: {
              and: [
                { owner: { equals: actor.id } },
                { status: { not_equals: "closed" } },
                { or: [{ status: { equals: "new" } }, { nextFollowUp: { less_than: end } }] },
              ],
            },
            select: { reference: true, status: true, nextFollowUp: true, createdAt: true },
          })
          .then((r) => r.docs)
      : [],
    canReview
      ? p
          .find({
            ...access,
            collection: "content-drafts",
            where: {
              reviewState,
              ...(!legacyPolicy && { kind: { not_equals: "immigration-policy" } }),
            },
            select: { title: true, updatedAt: true, ...contributors },
          })
          .then((r) => r.docs)
      : [],
    canReview && policy
      ? p
          .find({
            ...query,
            collection: "policy-fact-drafts",
            where: { reviewState },
            select: { group: true, facts: true, updatedAt: true, ...contributors },
          })
          .then((r) => r.docs)
      : [],
    canReview && policy
      ? p
          .find({
            ...query,
            collection: "policy-note-drafts",
            where: { reviewState },
            select: { group: true, locale: true, title: true, updatedAt: true, ...contributors },
          })
          .then((r) => r.docs)
      : [],
    p
      .find({
        ...query,
        collection: "workflow-tasks",
        where: {
          and: [
            { assignee: { equals: actor.id } },
            { status: { equals: "open" } },
            {
              or: [
                { dueAt: { exists: false } },
                { dueAt: { less_than: end } },
                ...(policy ? [{ key: { like: "policy-review:%" } }] : []),
              ],
            },
          ],
        },
      })
      .then((r) => r.docs),
  ]);
  for (const inquiry of inquiries) {
    const dueAt =
      inquiry.nextFollowUp && Date.parse(inquiry.nextFollowUp) < Date.parse(end)
        ? inquiry.nextFollowUp
        : undefined;
    items.push({
      id: `inquiry-${inquiry.id}`,
      title: inquiry.reference,
      createdAt: inquiry.createdAt,
      dueAt,
      action: inquiry.status === "new" ? "查看并处理新咨询" : "查看咨询并记录跟进",
      href: `/admin/collections/inquiries/${inquiry.id}`,
    });
  }
  const needsReview = (draft: {
    contributors?: unknown;
    lastEditedBy?: number | null;
    submittedBy?: number | null;
  }) =>
    ![
      ...(Array.isArray(draft.contributors) ? draft.contributors : []),
      draft.lastEditedBy,
      draft.submittedBy,
    ].some((id) => id != null && String(id) === String(actor.id));
  for (const draft of drafts.filter(needsReview))
    items.push({
      id: `content-${draft.id}`,
      title: draft.title,
      createdAt: draft.updatedAt,
      action: "核对内容并审核",
      href: `/content-center?id=${draft.id}`,
    });
  for (const draft of facts.filter(needsReview))
    items.push({
      id: `fact-${draft.id}`,
      title: sharedPolicyForm(draft.facts).countryNameZh || `政策事实 #${relationID(draft.group)}`,
      createdAt: draft.updatedAt,
      action: "核对政策事实并审核",
      href: `/content-center/policy-facts?id=${relationID(draft.group)}`,
    });
  for (const draft of notes.filter(needsReview))
    if (["zh", "en"].includes(draft.locale))
      items.push({
        id: `note-${draft.id}`,
        title: draft.title,
        createdAt: draft.updatedAt,
        action: "核对政策说明并审核",
        href: `/content-center/policy-facts?id=${relationID(draft.group)}&locale=${draft.locale}`,
      });
  const visibleTasks = await Promise.all(
    tasks.map(async (task) => {
      if ((relationID(task.policyGroup) || task.key.startsWith("policy-review:")) && !policy)
        return null;
      if (!(await workflowSourceVisible(p, actor, task))) return null;
      const group = relationID(task.policyGroup);
      const locale = task.key.split(":")[2];
      if (relationID(task.inquiry) && /^inquiry:\d+:(followup|inquiry-created):/.test(task.key))
        return null; // The live inquiry supplies these items, including changes to its deadline.
      const href =
        group && (locale === "zh" || locale === "en")
          ? `/content-center/policy-facts?id=${group}&locale=${locale}`
          : `/workflow-center?task=${task.id}`;
      return {
        id: `task-${task.id}`,
        title: task.title,
        createdAt: task.createdAt,
        dueAt: task.dueAt ?? undefined,
        action: group ? "打开政策说明复核" : "打开并处理待办",
        href,
      };
    }),
  );
  items.push(...visibleTasks.filter((item) => item !== null));
  if (isManager(actor)) items.push(...(await quoteTasks(p, access)));
  return { date, items: sortToday(items) };
}

async function quoteTasks(
  p: Payload,
  access: typeof query & { user: NonNullable<Staff>; overrideAccess: false },
) {
  const actor = access.user;
  const { docs: inquiries } = await p.find({
    ...access,
    collection: "inquiries",
    select: { reference: true },
  });
  if (!inquiries.length) return [];
  const { docs: cases } = await p.find({
    ...query,
    collection: "service-cases",
    where: { inquiry: { in: inquiries.map(({ id }) => id) } },
    select: { inquiry: true },
  });
  if (!cases.length) return [];
  const [{ docs: quotes }, notices] = await Promise.all([
    p.find({
      ...query,
      collection: "service-quotes",
      where: {
        serviceCase: { in: cases.map(({ id }) => id) },
        status: { equals: "draft" },
        lineFormat: { equals: 2 },
        reviewStatus: { equals: "pending" },
        createdBy: { not_equals: actor.id },
      },
      select: { lineFormat: true, lines: true, serviceCase: true, title: true, updatedAt: true },
    }),
    readQuoteNoticeSettings(p),
  ]);
  return quotes
    .filter((quote) => quoteNoticesCurrent(quote, notices))
    .map((quote) => ({
      id: `quote-${quote.id}`,
      title: quote.title,
      createdAt: quote.updatedAt,
      action: "核对费用并审核报价",
      href: `/business-center?id=${relationID(quote.serviceCase)}#quote-${quote.id}`,
    }));
}
