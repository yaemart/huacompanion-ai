import type { Payload, PayloadRequest } from "payload";
import {
  parseReminderEnvelope,
  reminderHash,
  type ReminderScope,
} from "../lib/exhibition-reminders";
import { validExhibitionDate } from "../lib/exhibitions";
import type { ReminderReport } from "./exhibition-reminders";
import { withReminderReadOnly } from "./exhibition-reminder-authority";
import { ContentError } from "./content/error";

export async function findExhibitionReminderAudit(
  p: Payload,
  req: Partial<PayloadRequest>,
  actor: number,
  digest: string,
  scope: ReminderScope,
): Promise<ReminderReport | null> {
  const row = (
    await p.find({
      collection: "audit-events",
      req,
      depth: 0,
      limit: 1,
      sort: "-id",
      where: {
        and: [
          { entity: { equals: "exhibition-reminder-jobs" } },
          { action: { equals: "generate-local" } },
          { recordId: { equals: digest } },
          { actor: { equals: actor } },
        ],
      },
    })
  ).docs[0];
  if (!row) return null;
  try {
    const after = row.after as { scope: string; report: ReminderReport },
      r = after.report,
      c = r.counts;
    const num = (value: number) => {
      if (!Number.isSafeInteger(value) || value < 0) throw Error();
      return value;
    };
    if (
      after.scope !== JSON.stringify([scope.key, scope.locale]) ||
      !r ||
      r.scope?.key !== scope.key ||
      r.scope?.locale !== scope.locale ||
      !validExhibitionDate(r.today) ||
      typeof r.asOf !== "string" ||
      !Number.isFinite(Date.parse(r.asOf)) ||
      new Date(r.asOf).toISOString() !== r.asOf ||
      ![30, 7, null].includes(r.offset) ||
      typeof r.blocked !== "boolean" ||
      !c ||
      !c.excluded ||
      typeof c.excluded !== "object" ||
      Array.isArray(c.excluded)
    )
      throw Error();
    let snapshot: ReminderReport["snapshot"];
    if (r.snapshot !== undefined) {
      const s = r.snapshot;
      if (
        !s ||
        !Number.isSafeInteger(s.revision) ||
        Number(s.revision) < 1 ||
        !["title", "path", "startDate", "endDate", "venue", "address"].every(
          (key) => typeof s[key] === "string",
        ) ||
        !validExhibitionDate(s.startDate as string) ||
        !validExhibitionDate(s.endDate as string)
      )
        throw Error();
      snapshot = Object.fromEntries(
        ["title", "revision", "path", "startDate", "endDate", "venue", "address"].map((key) => [
          key,
          s[key],
        ]),
      );
    }
    return {
      scope,
      snapshot,
      today: r.today,
      asOf: r.asOf,
      offset: r.offset,
      blocked: r.blocked,
      counts: {
        subscribers: num(c.subscribers),
        eligible: num(c.eligible),
        terminal: num(c.terminal),
        create: num(c.create),
        existing: num(c.existing),
        cancel: num(c.cancel),
        excluded: Object.fromEntries(
          Object.entries(c.excluded)
            .filter(([key]) =>
              ["invalid", "duplicate", "unconfirmed", "language", "privacy", "suppressed"].includes(
                key,
              ),
            )
            .map(([key, value]) => [key, num(value)]),
        ),
      },
      replayed: true,
      currentEligibility: "not-checked",
    };
  } catch {
    throw new ContentError("历史回执资料无效，请先核实审计记录。", 503);
  }
}
export async function inspectExhibitionReminder(p: Payload, headers: Headers, receipt: unknown) {
  return withReminderReadOnly(p, headers, async ({ req, user }) => {
    let seal;
    try {
      seal = parseReminderEnvelope(receipt);
    } catch {
      throw new ContentError("预检回执无效。", 409);
    }
    if (seal.actor !== user.id) throw new ContentError("请使用原管理员的有效会话核实。", 403);
    const scope = { key: seal.key, locale: seal.locale };
    const report = await findExhibitionReminderAudit(p, req, user.id, reminderHash(receipt), scope);
    return report
      ? { state: "committed" as const, report }
      : { state: "not-found" as const, scope, currentEligibility: "not-checked" as const };
  });
}
