import { isPolicyCalendarDate } from "./immigration-policy.ts";

export function policyReminderWindows(until: unknown, today: string): (30 | 7)[] {
  if (!isPolicyCalendarDate(today)) throw Error("Invalid reminder calendar date");
  if (!isPolicyCalendarDate(until)) return [];
  const days = (Date.parse(until) - Date.parse(today)) / 86400000;
  return ([30, 7] as const).filter((threshold) => days <= threshold);
}
export function policyReminderKey(draft: number, revision: number, until: string, days: 30 | 7) {
  return `policy-review:${draft}:${revision}:${until}:${days}`;
}
