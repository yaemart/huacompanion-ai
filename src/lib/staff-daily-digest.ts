import { chinaDay } from "./staff-today.ts";
import type { workflowEventTypes } from "./workflow.ts";

export type DigestCandidate = {
  type: (typeof workflowEventTypes)[number];
  routine?: boolean;
  dueAt?: string;
};

export function staffDigestAt(enabled: boolean, event: DigestCandidate, now: number) {
  if (!enabled || event.type !== "case-stage" || event.routine !== true || event.dueAt) return;
  const { date, end } = chinaDay(now);
  const thisMorning = Date.parse(`${date}T09:00:00+08:00`);
  const nextMorning = Date.parse(end) + 9 * 60 * 60 * 1000;
  return new Date(now < thisMorning ? thisMorning : nextMorning).toISOString();
}
