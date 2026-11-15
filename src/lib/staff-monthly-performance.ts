import { canAppeal } from "./performance-incidents.ts";
import { chinaDay } from "./staff-today.ts";

export function performanceMonth(value: unknown, now: number) {
  const current = chinaDay(now).date.slice(0, 7);
  const month = value ?? current;
  if (typeof month !== "string" || !/^20\d\d-(0[1-9]|1[0-2])$/.test(month) || month > current)
    return null;
  const start = new Date(month + "-01T00:00:00+08:00").toISOString();
  const next = new Date(month + "-01T00:00:00.000Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = new Date(next.toISOString().slice(0, 10) + "T00:00:00+08:00").toISOString();
  return {
    month,
    current,
    start,
    end,
    through: new Date(Math.min(now, Date.parse(end))).toISOString(),
  };
}

export function findingStatus(finding: Parameters<typeof canAppeal>[0], now: number) {
  if (!finding.active) return null;
  if (finding.appealAt && !finding.resolvedAt) return "review";
  return canAppeal(finding, now) ? "window" : "counted";
}

type TaskHistoryItem = {
  action: string;
  at: string;
  assignee?: number;
  dueAt?: string;
};
type TaskInput = { assignee: number | null; due: string | null; history: unknown };
function historyItem(value: unknown): value is TaskHistoryItem {
  return (
    !!value &&
    typeof value === "object" &&
    "action" in value &&
    "at" in value &&
    typeof value.action === "string" &&
    typeof value.at === "string" &&
    Number.isFinite(Date.parse(value.at))
  );
}

export function taskAtCutoff(task: TaskInput, cutoff: string) {
  let { assignee, due } = task;
  let doneAt: string | null = null;
  let canceled = false;
  for (const entry of Array.isArray(task.history) ? task.history.filter(historyItem) : []) {
    const at = new Date(entry.at).toISOString();
    if (at >= cutoff) break;
    if (entry.action === "assign" || entry.action === "claim")
      assignee = Number(entry.assignee) || null;
    else if (entry.action === "system-unassign") assignee = null;
    else if (entry.action === "postpone" && entry.dueAt && Number.isFinite(Date.parse(entry.dueAt)))
      due = new Date(entry.dueAt).toISOString();
    else if (["done", "note-approved", "system-close"].includes(entry.action)) {
      doneAt = at;
      canceled = entry.action === "system-close";
    } else if (entry.action === "note-unpublished") {
      doneAt = null;
      canceled = false;
    }
  }
  return { assignee, due, doneAt, canceled };
}

type FollowupEvent = {
  inquiry: string;
  at: Date;
  action: string;
  actor: number | null;
  ownerChanged: boolean | null;
  owner: number | null;
  dueChanged: boolean | null;
  due: Date | null;
};

export function followupTotals(
  events: FollowupEvent[],
  staff: number | null,
  start: string,
  through: string,
) {
  const totals = { due: 0, onTime: 0 };
  let inquiry: string | undefined;
  let owner: number | null = null;
  let due: string | undefined;
  const finish = (onTime: boolean) => {
    if (
      owner !== null &&
      (staff === null || owner === staff) &&
      due &&
      due >= start &&
      due < through
    ) {
      totals.due++;
      if (onTime) totals.onTime++;
    }
    due = undefined;
  };

  for (const event of events) {
    if (inquiry !== event.inquiry) {
      finish(false);
      inquiry = event.inquiry;
      owner = null;
    }
    const at = event.at.toISOString();
    if (due && at > due) finish(false);
    if (event.ownerChanged) owner = event.owner;
    if (event.dueChanged) due = event.due?.toISOString();
    if (event.action === "followup-appended" && event.actor === owner) finish(true);
  }
  finish(false);
  return totals;
}
