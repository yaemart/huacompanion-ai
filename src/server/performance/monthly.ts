import type { Payload } from "payload";
import type { Staff as StaffDocument } from "../../../payload-types";
import { isActiveStaff, isAdmin, type Staff } from "../../cms/access";
import { inquiryCaseID } from "../../lib/intake-case";
import {
  findingStatus,
  followupTotals,
  performanceMonth,
  taskAtCutoff,
} from "../../lib/staff-monthly-performance";
import type { IncidentSource } from "../../lib/performance-incidents";
import { ContentError } from "../content/error";
import { readScorecardObservation } from "./scorecard-observation";
import {
  monthlyIncidents,
  monthlyFollowups,
  monthlyResponses,
  monthlyReviews,
  monthlyReviewTasks,
} from "./monthly-queries";

type Person = Pick<StaffDocument, "id" | "name" | "active">;
type Incident = {
  id: number;
  state: "pending" | "confirmed";
  source: IncidentSource;
  active: boolean | null;
  notifiedAt: Date | null;
  appealAt: Date | null;
  resolvedAt: Date | null;
};
type PendingReason = "confirmation" | "window" | "review";
type Task = {
  assignee: number | null;
  due: Date | null;
  history: unknown;
};

export async function readMonthlyPerformance(
  payload: Payload,
  user: Staff,
  query: { month?: unknown; staff?: unknown },
  now = Date.now(),
) {
  if (!user || !isActiveStaff(user)) throw new ContentError("请使用员工账号登录。", 403);
  const actor = await payload.findByID({
    collection: "staff",
    id: user.id,
    depth: 0,
    disableErrors: true,
  });
  if (!actor || !isActiveStaff(actor)) throw new ContentError("员工权限已撤销。", 403);
  const admin = isAdmin(actor);
  const personQuery = query.staff;
  if (!admin && personQuery !== undefined && personQuery !== String(actor.id))
    throw new ContentError("你只能查看本人的月报。", 403);
  let scope: number | null = actor.id;
  if (admin) {
    scope = null;
    if (personQuery !== undefined && personQuery !== "") {
      const id = inquiryCaseID(personQuery);
      if (!id || id > 2147483647) throw new ContentError("请选择有效的员工。");
      scope = id;
    }
  }
  const period = performanceMonth(query.month, now);
  if (!period) throw new ContentError("请选择当前月份或更早的有效月份。");

  const client = await payload.db.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const people = admin
      ? (await client.query<Person>("SELECT id, name, active FROM staff ORDER BY name, id")).rows
      : undefined;
    const selected = scope === null ? null : (people?.find(({ id }) => id === scope) ?? actor);
    if (scope !== null && selected?.id !== scope) throw new ContentError("没有找到该员工。", 404);
    const args = [scope, period.start, period.through];
    const { rows: incidents } = await client.query<Incident>(monthlyIncidents, args);
    const cutoff = [scope, period.through];
    const { rows: tasks } = await client.query<Task>(monthlyReviewTasks, cutoff);
    const { rows: followups } = await client.query<Parameters<typeof followupTotals>[0][number]>(
      monthlyFollowups,
      cutoff,
    );
    const {
      rows: [response],
    } = await client.query<{ samples: number; minutes: number | null }>(monthlyResponses, args);
    const {
      rows: [review],
    } = await client.query<{
      decisions: number;
      returned: number;
      samples: number;
      minutes: number | null;
    }>(monthlyReviews, args);
    const records = summarizeIncidents(incidents, now);
    const followup = followupTotals(followups, scope, period.start, period.through);
    const reviewTasks = summarizeReviewTasks(tasks, scope, period.start, period.through);
    const scorecard = await readScorecardObservation(client, scope, period, now, {
      response,
      review,
      followup,
      reviewTasks,
      ...records,
    });
    await client.query("COMMIT");

    return {
      period,
      asOf: new Date(now).toISOString(),
      name: selected?.name ?? null,
      staff: scope,
      people,
      response,
      review,
      ...records,
      followup,
      overdueReviews: reviewTasks.overdue,
      scorecard,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function summarizeIncidents(rows: Incident[], now: number) {
  const pending = new Map<number, { id: number; source: IncidentSource; reason: PendingReason }>();
  const confirmed = new Map<number, IncidentSource>();
  for (const row of rows) {
    const phase = row.notifiedAt
      ? findingStatus(
          {
            active: !!row.active,
            notifiedAt: row.notifiedAt.toISOString(),
            appealAt: row.appealAt?.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString(),
          },
          now,
        )
      : null;
    if (row.state === "pending" || phase === "window" || phase === "review") {
      if (phase === "review" || !pending.has(row.id))
        pending.set(row.id, {
          id: row.id,
          source: row.source,
          reason:
            row.state === "pending" ? "confirmation" : phase === "review" ? "review" : "window",
        });
    } else confirmed.set(row.id, row.source);
  }
  const incidents = { complaints: 0, corrections: 0 };
  for (const [id, source] of confirmed) {
    if (pending.has(id)) continue;
    if (source === "case") incidents.complaints++;
    else incidents.corrections++;
  }
  return { incidents, pending: [...pending.values()] };
}

function summarizeReviewTasks(rows: Task[], scope: number | null, start: string, cutoff: string) {
  let overdue = 0;
  let due = 0;
  for (const row of rows) {
    const task = taskAtCutoff({ ...row, due: row.due?.toISOString() ?? null }, cutoff);
    if (
      task.assignee === null ||
      (scope !== null && scope !== task.assignee) ||
      !task.due ||
      task.due >= cutoff
    )
      continue;
    if (!task.doneAt) overdue++;
    if (task.canceled && task.doneAt && task.doneAt <= task.due) continue;
    if (task.due >= start || !task.doneAt || task.doneAt >= start) due++;
  }
  return { overdue, due };
}
