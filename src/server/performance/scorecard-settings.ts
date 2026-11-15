import type { Payload, PayloadRequest } from "payload";
import type { AuditEvent, ScorecardPlan } from "../../../payload-types";
import { isAdmin, type Staff } from "../../cms/access";
import { chinaDay } from "../../lib/staff-today";
import {
  defaultScorecardRules,
  scorecardMonth,
  scorecardTemplateKeys,
  validateScorecardRules,
  type ScorecardRules,
  type ScorecardTemplate,
} from "../../lib/staff-scorecard";
import { ContentError } from "../content/error";
import { contentTransaction } from "../content/service";
import { transactionSession } from "../db-types";

type Req = Partial<PayloadRequest>;
const onlyAdmin = () => new ContentError("只有管理员可以查看或修改评分规则。", 403);

async function scorecardAdmin(p: Payload, user: Staff, req?: Req) {
  if (!isAdmin(user)) throw onlyAdmin();
  const actor = await p.findByID({
    collection: "staff",
    id: user!.id,
    depth: 0,
    req,
    disableErrors: true,
  });
  if (!actor || !isAdmin(actor)) throw onlyAdmin();
  return actor;
}

function rulesOf(value: unknown) {
  try {
    return validateScorecardRules(value);
  } catch (error) {
    throw new ContentError(error instanceof Error ? error.message : "评分配置有误。");
  }
}

async function planWithKey(p: Payload, key: string, req?: Req) {
  return (
    await p.find({
      collection: "scorecard-plans",
      where: { key: { equals: key } },
      depth: 0,
      limit: 1,
      req,
    })
  ).docs[0];
}

export async function readScorecardSettings(p: Payload, user: Staff) {
  await scorecardAdmin(p, user);
  const { docs } = await p.find({
    collection: "staff",
    depth: 0,
    select: { name: true, active: true, role: true },
    pagination: false,
    sort: ["name", "id"],
  });
  const people = docs.map(({ id, name, active, role }) => ({ id, name, active, role }));
  const draft = await planWithKey(p, "draft");
  const plans = (
    await p.find({
      collection: "scorecard-plans",
      where: { effectiveMonth: { exists: true } },
      depth: 0,
      pagination: false,
      sort: "effectiveMonth",
      select: { effectiveMonth: true, revision: true },
    })
  ).docs.map(({ effectiveMonth, revision }) => ({ effectiveMonth, revision }));
  const rules = draft ? rulesOf(draft.configuration) : defaultScorecardRules();
  if (!draft)
    for (const person of people)
      if (
        person.active !== false &&
        person.role !== "admin" &&
        scorecardTemplateKeys.includes(person.role as ScorecardTemplate)
      )
        rules.assignments[String(person.id)] = person.role as ScorecardTemplate;
  return { rules, revision: draft?.revision ?? 0, people, plans, trialLocked: plans.length > 0 };
}

function checkedCommand(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContentError("评分配置格式有误。");
  const input = value as Record<string, unknown>;
  const { action, revision, reason } = input;
  if (action !== "save" && action !== "schedule")
    throw new ContentError("请选择保存草稿或安排试行规则。");
  const allowed = ["action", "reason", "revision", action === "save" ? "rules" : "month"];
  if (Object.keys(input).some((name) => !allowed.includes(name)))
    throw new ContentError("评分配置格式有误，请重新打开表单。");
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0)
    throw new ContentError("请先刷新评分规则。", 409);
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500)
    throw new ContentError("请填写本次调整原因（1 到 500 字）。");
  return { action, revision, reason: reason.trim(), rules: input.rules, month: input.month };
}

export async function changeScorecardSettings(
  p: Payload,
  user: Staff,
  input: unknown,
  now?: number,
) {
  if (!isAdmin(user)) throw onlyAdmin();
  const command = checkedCommand(input);
  return contentTransaction(p, async (req) => {
    await transactionSession(p, req.transactionID).db.execute(
      "SELECT pg_advisory_xact_lock(726281)",
    );
    const actor = await scorecardAdmin(p, user, req);
    const current = chinaDay(now ?? Date.now()).date.slice(0, 7);
    const draft = await planWithKey(p, "draft", req);
    if ((draft?.revision ?? 0) !== command.revision)
      throw new ContentError("评分规则已更新，请保留输入并刷新后再修改。", 409);
    const first = (
      await p.find({
        collection: "scorecard-plans",
        where: { effectiveMonth: { exists: true } },
        limit: 1,
        depth: 0,
        sort: "effectiveMonth",
        req,
      })
    ).docs[0];
    const rules = rulesOf(command.action === "save" ? command.rules : draft?.configuration);
    if (first && rules.trialStart !== first.effectiveMonth)
      throw new ContentError("试行开始月已锁定，请保留既定月份。", 409);

    const data: Pick<ScorecardPlan, "key" | "effectiveMonth" | "revision" | "configuration"> = {
      key: "draft",
      revision: command.revision + 1,
      configuration: rules,
    };
    let prior = draft;
    if (command.action === "save") {
      if (!first && rules.trialStart && rules.trialStart <= current)
        throw new ContentError("试行须从未来的完整北京时间自然月开始。");
      await validateAssignments(p, rules, req);
    } else {
      const month = command.month;
      if (!scorecardMonth(month) || month <= current)
        throw new ContentError("请选择未来的北京时间自然月。");
      if (!rules.trialStart || month < rules.trialStart || (!first && month !== rules.trialStart))
        throw new ContentError("第一次安排的月份须等于试行开始月。");
      prior = await planWithKey(p, month, req);
      if (prior?.revision === command.revision) return { revision: command.revision };
      await validateAssignments(p, rules, req);
      Object.assign(data, { key: month, effectiveMonth: month, revision: command.revision });
    }
    const saved = prior
      ? await p.update({ collection: "scorecard-plans", id: prior.id, data, req })
      : await p.create({ collection: "scorecard-plans", data, req });
    const snapshot = (plan?: ScorecardPlan) =>
      plan && { revision: plan.revision, month: plan.effectiveMonth, rules: plan.configuration };
    const after: AuditEvent["after"] = { ...snapshot(saved), reason: command.reason };
    await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "scorecard-plan",
        recordId: data.key,
        action: command.action,
        actor: actor.id,
        before: snapshot(prior),
        after,
      },
    });
    return { revision: saved.revision };
  });
}

async function validateAssignments(p: Payload, rules: ScorecardRules, req: Req) {
  const ids = Object.keys(rules.assignments).map(Number);
  if (!ids.length) return;
  const assigned = await p.count({ collection: "staff", where: { id: { in: ids } }, req });
  if (assigned.totalDocs !== ids.length)
    throw new ContentError("名单中的员工已变更，请刷新后重新选择。");
}
