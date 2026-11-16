const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const calendarDay = /^\d{4}-\d{2}-\d{2}$/;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
type DateValue = string | Date | null | undefined;

function validCalendarDay(day: string) {
  const utc = new Date(day + "T00:00:00Z");
  return Number.isFinite(utc.getTime()) && utc.toISOString().slice(0, 10) === day;
}

function checkedDate(value: DateValue) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
  if (!value || !instant.test(value) || !validCalendarDay(value.slice(0, 10))) return;
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed;
}

export function staffDate(value: DateValue): string {
  if (typeof value === "string" && calendarDay.test(value))
    return validCalendarDay(value) ? value : "—";
  const date = checkedDate(value);
  if (!date) return "—";
  const parts = Object.fromEntries(
    calendar.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`;
}

export function staffDateTime(value: DateValue, seconds = false): string {
  const date = checkedDate(value);
  if (!date) return staffDate(value);
  const time = clock.format(date);
  return `${staffDate(date)} ${seconds ? time : time.slice(0, 5)}`;
}

export function staffVersion(value: number | string | null | undefined): string {
  const version = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof version === "number" && Number.isSafeInteger(version) && version > 0
    ? `第 ${version} 版`
    : "版本号未记录";
}
