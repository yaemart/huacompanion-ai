import { createHash } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type {
  AuditEvent,
  PerformanceFinding,
  PerformanceIncident,
  Staff,
} from "../../../payload-types";
import { canReviewContent, isActiveStaff, isAdmin, isManager, relationID } from "../../cms/access";
import { inquiryCaseID } from "../../lib/intake-case";
import {
  appealClosesAt,
  canAppeal,
  factIssueLabels,
  incidentPhase,
  incidentResponsibilities,
  incidentRoles,
  incidentSources,
  independentReviewer,
  normalizedIssue,
  type IncidentDuty,
} from "../../lib/performance-incidents";
import { quoteTime } from "../../lib/quote-time";
import { chinaDay } from "../../lib/staff-today";
import { ContentError } from "../content/error";
import { contentTransaction } from "../content/service";
import { transactionSession } from "../db-types";
import {
  complaintCustomerName,
  fields,
  incidentSource,
  sourcePermission,
  staffIDs,
} from "./sources";

type Req = Partial<PayloadRequest>;
type Command = Record<string, unknown>;
type Finding = Pick<PerformanceFinding, "duty" | "summary"> & { staff: number };
const missing = () => new ContentError("无法打开这条记录，请回到工作台重新选择。", 404);
const forbidden = () => new ContentError("请交由有来源权限、且未参与原处理的员工办理。", 403);

function object(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContentError("请重新打开表单后提交。");
  return value as Command;
}
function text(value: unknown, name: string, limit: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit)
    throw new ContentError(`请填写「${name}」，最多 ${limit} 字。`);
  return value.trim();
}
function publicNote(value: unknown, name: string, limit: number, customerName = "") {
  const detail = text(value, name, limit);
  if (/(?:https?:\/\/|[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[a-z]{2,}|\d(?:[\s()-]*\d){6,})/iu.test(detail))
    throw new ContentError("给员工看的说明请移除完整网址、邮箱和联系方式，凭据留在内部记录。");
  const nameToHide = normalizedIssue(customerName);
  if (nameToHide.length >= 2 && normalizedIssue(detail).includes(nameToHide))
    throw new ContentError("给员工看的说明请移除客户姓名。");
  return detail;
}
function id(value: unknown) {
  const result = inquiryCaseID(value);
  if (!result) throw missing();
  return result;
}
function choice<T extends string>(value: unknown, options: readonly T[], name: string) {
  const result = options.find((option) => option === value);
  if (!result) throw new ContentError(`请重新选择「${name}」。`);
  return result;
}
function peopleFor(record: PerformanceIncident, duty: IncidentDuty | "conflicts") {
  const value = fields(record.participants)[duty];
  return staffIDs(Array.isArray(value) ? value : []);
}
const involved = (record: PerformanceIncident) =>
  staffIDs([...incidentRoles, "conflicts" as const].flatMap((duty) => peopleFor(record, duty)));

async function findIncident(p: Payload, record: number, req?: Req) {
  const result = await p.findByID({
    collection: "performance-incidents",
    id: record,
    depth: 0,
    req: { ...req },
    disableErrors: true,
  });
  if (!result) throw missing();
  return result;
}
const findingsFor = async (p: Payload, record: number, req?: Req) =>
  (
    await p.find({
      collection: "performance-findings",
      where: { incident: { equals: record } },
      pagination: false,
      depth: 0,
      req: { ...req },
    })
  ).docs;
async function reviewAccess(p: Payload, user: Staff, record: PerformanceIncident, req?: Req) {
  try {
    const { review, team } = await sourcePermission(
      p,
      user,
      record.source,
      record.sourceRecord,
      req,
    );
    const sameTeam = record.source !== "case" || (!!team && team === record.sourceTeam);
    return (
      review && (isAdmin(user) || (sameTeam && independentReviewer(user.id, involved(record))))
    );
  } catch (error) {
    if (error instanceof ContentError && error.status === 404) return false;
    throw error;
  }
}

async function audit(
  p: Payload,
  req: Req,
  actor: number,
  record: number,
  action: string,
  after: AuditEvent["after"],
) {
  await p.create({
    collection: "audit-events",
    req: { ...req },
    data: { entity: "performance-incident", recordId: String(record), action, actor, after },
  });
}

async function notify(
  p: Payload,
  req: Req,
  actor: number,
  record: number,
  finding: PerformanceFinding,
  resolution?: { at: string; result: string },
) {
  const notification = await p.create({
    collection: "workflow-notifications",
    req: { ...req },
    data: {
      key: `performance:${finding.id}:${resolution ? `resolved:${resolution.result}:${resolution.at}` : "decision"}`,
      recipient: relationID(finding.staff),
      performanceIncident: record,
      title: resolution ? "你的业绩记录有复核更新" : "你收到一条业绩判定，可在期限内申请复核",
    },
  });
  await audit(p, req, actor, record, "notify", {
    finding: finding.id,
    notification: notification.id,
    resolved: !!resolution,
  });
}

async function register(p: Payload, req: Req, actor: Staff, input: Command, now: number) {
  const source = choice(input.source, incidentSources, "来源");
  const record = id(input.sourceRecord);
  const version = id(input.sourceVersion);
  const title = text(input.title, "问题简称", 200);
  const evidence = text(input.evidence, "内部事实和凭据", 4000);
  const time = quoteTime(input.occurredAt);
  if (source === "case" && (!Number.isFinite(time) || time > now))
    throw new ContentError("请填写发生时间（北京时间），时间须在现在或之前。");
  const basis = await incidentSource(
    p,
    actor,
    source,
    record,
    version,
    source === "case" ? new Date(time).toISOString() : undefined,
    req,
  );
  const issue = normalizedIssue(title);
  if (!issue) throw new ContentError("请填写可识别的问题简称。");
  const issueField =
    source === "fact"
      ? choice(input.issueField, Object.keys(factIssueLabels), "问题涉及的字段")
      : undefined;
  const date = source === "case" ? chinaDay(Date.parse(basis.occurredAt)).date : "";
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        source,
        version,
        date,
        issueField && issueField !== "other" ? issueField : issue,
      ]),
    )
    .digest("hex");
  const old = (
    await p.find({
      collection: "performance-incidents",
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      req: { ...req },
    })
  ).docs[0];
  if (old) {
    if (old.reportedBy === actor.id) return { id: old.id, duplicate: true };
    throw new ContentError("这个问题已登记，请联系负责人员补充到原记录。", 409);
  }
  let relatedIncident: number | undefined;
  if (input.relatedIncident) {
    const related = await findIncident(p, id(input.relatedIncident), req);
    await sourcePermission(p, actor, related.source, related.sourceRecord, req);
    if (!(related.reportedBy === actor.id || (await reviewAccess(p, actor, related, req))))
      throw missing();
    if ((source === "case") === (related.source === "case"))
      throw new ContentError("这里可关联同一问题的投诉与内容纠错。");
    relatedIncident = related.id;
  }
  const saved = await p.create({
    collection: "performance-incidents",
    req: { ...req },
    data: {
      key,
      source,
      sourceRecord: record,
      sourceVersion: version,
      issueField,
      title,
      evidence,
      ...basis,
      relatedIncident,
      reportedBy: actor.id,
      state: "pending",
    },
  });
  await audit(p, req, actor.id, saved.id, "register", {
    source,
    sourceRecord: record,
    sourceVersion: version,
    relatedIncident,
  });
  return { id: saved.id, duplicate: false };
}
async function addFinding(
  p: Payload,
  req: Req,
  actor: number,
  record: PerformanceIncident,
  data: Finding,
  notifiedAt: string,
) {
  if (!peopleFor(record, data.duty).includes(data.staff))
    throw new ContentError("请按事发时的记录选择当事员工及其承担的责任环节。");
  const finding = await p.create({
    collection: "performance-findings",
    req: { ...req },
    data: { ...data, incident: record.id, notifiedAt, active: true },
  });
  await notify(p, req, actor, record.id, finding);
  return finding.id;
}
function findingInput(value: unknown, record: PerformanceIncident, customerName: string): Finding {
  const input = object(value);
  return {
    staff: id(input.staff),
    duty: choice(
      input.duty,
      record.source === "case" ? ["service"] : incidentRoles.slice(1),
      "责任环节",
    ),
    summary: publicNote(input.summary, "给本人的说明", 1000, customerName),
  };
}

async function decide(
  p: Payload,
  req: Req,
  actor: Staff,
  record: PerformanceIncident,
  input: Command,
  at: string,
) {
  if (record.state !== "pending") throw new ContentError("已有判定，请刷新后查看。", 409);
  if (!independentReviewer(actor.id, involved(record))) throw forbidden();
  const state = choice(input.state, ["confirmed", "dismissed"] as const, "判定结果");
  const decisionReason = text(input.reason, "判定理由与凭据", 2000);
  if (input.findings !== undefined && !Array.isArray(input.findings))
    throw new ContentError("请核对责任归属。");
  const customerName =
    record.source === "case" && input.findings?.length
      ? await complaintCustomerName(p, actor, record.sourceRecord, req)
      : "";
  const findings = (input.findings ?? []).map((value) => findingInput(value, record, customerName));
  const responsibility =
    state === "confirmed" ? choice(input.responsibility, incidentResponsibilities, "归属") : null;
  if (responsibility === "supplier" && record.source !== "case")
    throw new ContentError("请根据内容发布记录填写归属。");
  if (
    (findings.length > 0 && responsibility !== "company") ||
    (record.source === "case" && findings.length > 1) ||
    new Set(findings.map(({ staff }) => staff)).size !== findings.length
  )
    throw new ContentError("请核对判定结果和个人归属，同一员工仅登记一次。");
  if (findings.length && input.redacted !== true)
    throw new ContentError("请核对给员工看的说明，并确认已移除客户信息。");
  if (
    state === "confirmed" &&
    !record.completeHistory &&
    (record.source !== "case" || findings.length)
  )
    throw new ContentError("缺少当时的责任或发布记录，请保留待确认。", 409);
  let duplicateOf: number | undefined;
  if (state === "dismissed" && input.duplicateOf) {
    const prior = await findIncident(p, id(input.duplicateOf), req);
    if (
      prior.id === record.id ||
      prior.state === "dismissed" ||
      prior.source !== record.source ||
      prior.sourceRecord !== record.sourceRecord ||
      !(await reviewAccess(p, actor, prior, req))
    )
      throw new ContentError("请选择同一原记录下仍有效的原登记编号。");
    duplicateOf = prior.id;
  }
  for (const finding of findings) await addFinding(p, req, actor.id, record, finding, at);
  await p.update({
    collection: "performance-incidents",
    id: record.id,
    req: { ...req },
    data: {
      state,
      responsibility,
      decidedBy: actor.id,
      firstConfirmedAt: state === "confirmed" ? at : null,
      decisionReason,
      duplicateOf,
    },
  });
  await audit(p, req, actor.id, record.id, "decide", {
    state,
    responsibility,
    duplicateOf,
    staff: findings.map(({ staff }) => staff),
    reason: decisionReason,
    at,
  });
}

async function appeal(
  p: Payload,
  req: Req,
  actor: Staff,
  record: PerformanceIncident,
  input: Command,
  now: number,
) {
  const current = (await findingsFor(p, record.id, req)).find(
    (item) => relationID(item.staff) === actor.id,
  );
  if (!current) throw missing();
  if (record.state !== "confirmed" || !canAppeal(current, now))
    throw new ContentError("该次申诉已经提交、截止，或判定已撤销。请刷新查看。", 409);
  const reason = text(input.reason, "申诉理由", 2000);
  await p.update({
    collection: "performance-findings",
    id: current.id,
    req: { ...req },
    data: { appealAt: new Date(now).toISOString(), appealReason: reason },
  });
  await audit(p, req, actor.id, record.id, "appeal", {
    finding: current.id,
    at: new Date(now).toISOString(),
  });
}

async function resolve(
  p: Payload,
  req: Req,
  actor: Staff,
  record: PerformanceIncident,
  input: Command,
  at: string,
) {
  if (!independentReviewer(actor.id, involved(record), record.decidedBy)) throw forbidden();
  const findings = await findingsFor(p, record.id, req);
  const current = findings.find((item) => item.id === id(input.finding));
  if (record.state !== "confirmed" || !current?.active || !current.appealAt || current.resolvedAt)
    throw new ContentError("这条申诉已由他人处理，请刷新。", 409);
  const result = choice(input.result, ["upheld", "changed", "dismissed"] as const, "复核结果");
  if (input.redacted !== true) throw new ContentError("请核对复核说明，确认已移除客户信息。");
  const customerName =
    record.source === "case" ? await complaintCustomerName(p, actor, record.sourceRecord, req) : "";
  const resolution = publicNote(input.summary, "给本人的复核说明", 1000, customerName);
  const reason = text(input.reason, "内部复核依据", 2000);
  let replacement: number | undefined;
  if (result === "changed" && input.replacement) {
    const next = findingInput(input.replacement, record, customerName);
    if (findings.some((item) => relationID(item.staff) === next.staff))
      throw new ContentError("该员工已有归属记录，请核对后选择。");
    replacement = await addFinding(p, req, actor.id, record, next, at);
  }
  const updated = result === "dismissed" ? findings.filter((item) => item.active) : [current];
  for (const item of updated) {
    const isAppellant = item.id === current.id;
    const saved = await p.update({
      collection: "performance-findings",
      id: item.id,
      req: { ...req },
      data: {
        active: result === "upheld",
        ...(isAppellant || (item.appealAt && !item.resolvedAt)
          ? {
              result,
              resolvedAt: at,
              resolvedBy: actor.id,
              resolution: isAppellant ? resolution : "该条判定已整体撤销。",
            }
          : {}),
      },
    });
    await notify(p, req, actor.id, record.id, saved, { at, result });
  }
  if (result === "dismissed")
    await p.update({
      collection: "performance-incidents",
      id: record.id,
      req: { ...req },
      data: { state: "dismissed", responsibility: null },
    });
  await audit(p, req, actor.id, record.id, "resolve", {
    finding: current.id,
    result,
    replacement,
    affected: updated.map(({ id }) => id),
    reason,
    at,
  });
}

export async function performanceAction(p: Payload, user: Staff, value: unknown, now?: number) {
  const receivedAt = now ?? Date.now();
  const input = object(value);
  return contentTransaction(p, async (req) => {
    await transactionSession(p, req.transactionID).db.execute(
      "SELECT pg_advisory_xact_lock(726281)",
    );
    const actor = await p.findByID({
      collection: "staff",
      id: user.id,
      depth: 0,
      req: { ...req },
      disableErrors: true,
    });
    if (!actor || !isActiveStaff(actor)) throw forbidden();
    if (input.action === "register") return register(p, req, actor, input, receivedAt);
    const record = await findIncident(p, id(input.id), req);
    if (input.action === "appeal") await appeal(p, req, actor, record, input, receivedAt);
    else {
      if (input.action === "supplement" && record.reportedBy === actor.id) {
        await sourcePermission(p, actor, record.source, record.sourceRecord, req);
      } else if (!(await reviewAccess(p, actor, record, req))) throw missing();
      const at = new Date(now ?? Date.now()).toISOString();
      if (input.action === "decide") await decide(p, req, actor, record, input, at);
      else if (input.action === "resolve") await resolve(p, req, actor, record, input, at);
      else if (input.action === "supplement") {
        if (record.state !== "pending")
          throw new ContentError("只有待确认的记录可以补充凭据。", 409);
        const addition = text(input.evidence, "补充凭据", 2000);
        const fingerprint = createHash("sha256").update(addition).digest("hex");
        const prior = await p.find({
          collection: "audit-events",
          where: {
            entity: { equals: "performance-incident" },
            recordId: { equals: String(record.id) },
            action: { equals: "supplement" },
            actor: { equals: actor.id },
          },
          pagination: false,
          depth: 0,
          req: { ...req },
        });
        if (prior.docs.some((entry) => fields(entry.after).fingerprint === fingerprint))
          return { id: record.id, duplicate: true };
        const evidence = text(record.evidence + "\n\n" + addition, "内部事实和凭据", 4000);
        await p.update({
          collection: "performance-incidents",
          id: record.id,
          req: { ...req },
          data: { evidence },
        });
        await audit(p, req, actor.id, record.id, "supplement", { at, fingerprint });
      } else throw new ContentError("请选择要进行的操作。");
    }
    return { id: record.id };
  });
}

const subjectFinding = (finding: PerformanceFinding, now: number) => ({
  id: finding.id,
  duty: finding.duty,
  summary: finding.summary,
  active: finding.active,
  appealClosesAt: appealClosesAt(finding.notifiedAt),
  canAppeal: canAppeal(finding, now),
  appealAt: finding.appealAt,
  appealReason: finding.appealReason,
  result: finding.result,
  resolvedAt: finding.resolvedAt,
  resolution: finding.resolution,
});
async function canReadSource(p: Payload, user: Staff, record: PerformanceIncident) {
  try {
    await sourcePermission(p, user, record.source, record.sourceRecord);
    return true;
  } catch (error) {
    if (error instanceof ContentError && error.status === 404) return false;
    throw error;
  }
}
async function linkedRecord(p: Payload, user: Staff, value: number | null | undefined) {
  if (!value) return undefined;
  const record = await p.findByID({
    collection: "performance-incidents",
    id: value,
    depth: 0,
    disableErrors: true,
  });
  if (!record) return undefined;
  if (record.reportedBy === user.id && (await canReadSource(p, user, record))) return record.id;
  return (await reviewAccess(p, user, record)) ? record.id : undefined;
}
const sourceReference = (record: PerformanceIncident) => ({
  source: record.source,
  sourceRecord: record.sourceRecord,
  sourceVersion: record.sourceVersion,
  sourceRevision: record.sourceRevision,
  sourceLocale: record.sourceLocale,
});
async function reviewProjection(
  p: Payload,
  user: Staff,
  record: PerformanceIncident,
  findings: PerformanceFinding[],
  now: number,
) {
  const ids = staffIDs(incidentRoles.flatMap((duty) => peopleFor(record, duty)));
  const people = ids.length
    ? (
        await p.find({
          collection: "staff",
          where: { id: { in: ids } },
          select: { name: true },
          pagination: false,
          depth: 0,
        })
      ).docs
    : [];
  return {
    id: record.id,
    ...sourceReference(record),
    title: record.title,
    evidence: record.evidence,
    occurredAt: record.occurredAt,
    state: incidentPhase(record, findings, now).state,
    completeHistory: record.completeHistory,
    decisionReason: record.decisionReason,
    responsibility: record.responsibility,
    relatedIncident: await linkedRecord(p, user, record.relatedIncident),
    duplicateOf: await linkedRecord(p, user, record.duplicateOf),
    canDecide: record.state === "pending" && independentReviewer(user.id, involved(record)),
    canResolve:
      record.state === "confirmed" &&
      independentReviewer(user.id, involved(record), record.decidedBy),
    people: people.map(({ id, name }) => ({
      id,
      name,
      duties: incidentRoles.filter((duty) => peopleFor(record, duty).includes(id)),
    })),
    findings: findings.map((item) => ({
      ...subjectFinding(item, now),
      staff: relationID(item.staff),
    })),
  };
}

export async function performanceRead(p: Payload, user: Staff, record?: number, now = Date.now()) {
  if (!isActiveStaff(user)) throw forbidden();
  const own = (
    await p.find({
      collection: "performance-findings",
      where: { staff: { equals: user.id }, ...(record && { incident: { equals: record } }) },
      limit: 100,
      depth: 0,
      sort: "-createdAt",
    })
  ).docs;
  const findingsByRecord = new Map(own.map((finding) => [relationID(finding.incident), finding]));
  type Summary = {
    id: number;
    source: PerformanceIncident["source"];
    state: PerformanceIncident["state"];
  };
  const personal: (Summary & { finding: ReturnType<typeof subjectFinding> })[] = [];
  const reports: (Summary & { title?: string; canSupplement: boolean })[] = [];
  const queue: Awaited<ReturnType<typeof reviewProjection>>[] = [];
  const reviewed: ({ id: number } & ReturnType<typeof sourceReference>)[] = [];
  const read = async (item: PerformanceIncident, canReview: boolean, asPublisher: boolean) => {
    const finding = findingsByRecord.get(item.id);
    if (finding)
      personal.push({
        id: item.id,
        source: item.source,
        state: incidentPhase(item, [finding], now).state,
        finding: subjectFinding(finding, now),
      });
    const report = item.reportedBy === user.id;
    if (!report && !canReview && !asPublisher) return;
    const findings = await findingsFor(p, item.id);
    const { state } = incidentPhase(item, findings, now);
    if (report) {
      const allowed = await canReadSource(p, user, item);
      reports.push({
        id: item.id,
        source: item.source,
        state,
        title: allowed ? item.title : undefined,
        canSupplement: allowed && item.state === "pending",
      });
    }
    if (canReview) queue.push(await reviewProjection(p, user, item, findings, now));
    if (asPublisher && state === "confirmed")
      reviewed.push({ id: item.id, ...sourceReference(item) });
  };

  const reviewer = isManager(user) || canReviewContent(user);
  const publisher = (item: PerformanceIncident) =>
    item.state === "confirmed" &&
    peopleFor(item, "review").includes(user.id) &&
    canReviewContent(user);
  if (record) {
    const item = await findIncident(p, record);
    await read(
      item,
      reviewer && (await reviewAccess(p, user, item)),
      publisher(item) && (await canReadSource(p, user, item)),
    );
    if (!personal.length && !reports.length && !queue.length && !reviewed.length) throw missing();
    return { personal, reports, queue, reviewed };
  }

  const incidentIDs = [...findingsByRecord.keys()];
  const recentReports = (
    await p.find({
      collection: "performance-incidents",
      where: { reportedBy: { equals: user.id } },
      limit: 100,
      sort: "-createdAt",
      depth: 0,
    })
  ).docs;
  const known = new Map(recentReports.map((item) => [item.id, item]));
  if (incidentIDs.length) {
    const items = await p.find({
      collection: "performance-incidents",
      where: { id: { in: incidentIDs } },
      pagination: false,
      depth: 0,
    });
    for (const item of items.docs) known.set(item.id, item);
  }
  if (reviewer) {
    const visited = new Set<number>();
    let page = 1;
    for (;;) {
      const items = await p.find({
        collection: "performance-incidents",
        limit: 100,
        page,
        sort: ["-createdAt", "-id"],
        depth: 0,
      });
      for (const item of items.docs) {
        const canReview = queue.length < 100 && (await reviewAccess(p, user, item));
        const asPublisher =
          reviewed.length < 100 && publisher(item) && (await canReadSource(p, user, item));
        if (!canReview && !asPublisher && !known.has(item.id)) continue;
        await read(item, canReview, asPublisher);
        visited.add(item.id);
      }
      if (
        !items.hasNextPage ||
        (queue.length >= 100 && (!canReviewContent(user) || reviewed.length >= 100))
      )
        break;
      page++;
    }
    for (const key of visited) known.delete(key);
  }
  for (const item of known.values()) await read(item, false, false);
  return { personal, reports, queue, reviewed };
}
