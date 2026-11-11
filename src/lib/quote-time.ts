const chinaOffset = 8 * 3600000;

export function quoteTime(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
  if (!match || match[0] !== value) return NaN;
  const [, day, minute, seconds = "00", fraction = "", zone = "+08:00"] = match;
  const local = `${day}T${minute}:${seconds}`;
  const check = Date.parse(local + "Z");
  if (!Number.isFinite(check) || new Date(check).toISOString().slice(0, 19) !== local) return NaN;
  return Date.parse(local + fraction + zone);
}

export function quoteLocalTime(value: string): string {
  const time = quoteTime(value);
  return Number.isFinite(time) ? new Date(time + chinaOffset).toISOString().slice(0, 16) : "";
}

export function quoteTimeLabel(value: string, locale = "zh"): string {
  const time = quoteTime(value);
  if (!Number.isFinite(time)) return "";
  const text = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "long",
  }).format(time);
  return `${text} (UTC+08:00)`;
}
