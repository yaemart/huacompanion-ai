import { createHash } from "node:crypto";
import type { ContentBody } from "./content-model.ts";
import { isContentIdentifier } from "./content-identifiers.ts";
import { isLocale } from "./locales.ts";
import { exhibitionPath, validExhibitionDate } from "./exhibitions.ts";
import { exhibitionText } from "./exhibition-copy.ts";

export function canExportExhibitionCalendar(body: ContentBody): boolean {
  const e = body.exhibition;
  return !!(
    body.kind === "exhibition" &&
    isLocale(body.locale) &&
    isContentIdentifier(body.contentKey) &&
    isContentIdentifier(body.slug) &&
    e &&
    ["announced", "ended"].includes(e.status) &&
    validExhibitionDate(e.startDate) &&
    validExhibitionDate(e.endDate) &&
    e.startDate >= "0001-01-01" &&
    e.startDate <= e.endDate &&
    e.endDate < "9999-12-31"
  );
}

function text(value: string): string {
  return value
    .toWellFormed()
    .replace(/\r\n|\r/g, "\n")
    .replace(/\p{Cc}/gu, (char) => (char === "\n" || char === "\t" ? char : ""))
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function fold(line: string): string {
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  return [...lines, current].join("\r\n");
}

const timestamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

export function buildExhibitionCalendar(
  body: ContentBody,
  origin: string,
  now = new Date(),
): string | null {
  if (!canExportExhibitionCalendar(body)) return null;
  const site = new URL(origin);
  if (!["http:", "https:"].includes(site.protocol) || site.username || site.password)
    throw Error("Calendar site URL unavailable");
  const e = body.exhibition!;
  const t = (key: Parameters<typeof exhibitionText>[1]) => exhibitionText(body.locale, key);
  const end = new Date(e.endDate + "T00:00:00.000Z");
  end.setUTCDate(end.getUTCDate() + 1);
  const url = new URL(exhibitionPath(body), site.origin).href;
  const uid = createHash("sha256")
    .update(`yaemart/huacompanion-ai:exhibition:${body.locale}:${body.contentKey}`)
    .digest("hex");
  const description = [
    body.summary,
    ...(e.phases ?? []).map(
      (phase) =>
        `${phase.name} (${phase.startDate && phase.endDate ? `${phase.startDate} — ${phase.endDate}` : t("unknown")}): ${phase.theme}`,
    ),
    e.officialURL ? `${t("official")}: ${e.officialURL}` : "",
    e.verifiedAt ? `${t("verified")}: ${e.verifiedAt}` : "",
    t("calendarNotice"),
  ]
    .filter(Boolean)
    .join("\n\n");
  const modified = body.publishedAt ? new Date(body.publishedAt) : null;
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//yaemart//Hua Companion Exhibitions//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:hua-exhibition-${uid}`,
      `DTSTAMP:${timestamp(now)}`,
      ...(modified && Number.isFinite(modified.getTime())
        ? [`LAST-MODIFIED:${timestamp(modified)}`]
        : []),
      ...(Number.isSafeInteger(body.publicationRevision) && body.publicationRevision! >= 0
        ? [`SEQUENCE:${body.publicationRevision}`]
        : []),
      `DTSTART;VALUE=DATE:${e.startDate.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll("-", "")}`,
      `SUMMARY:${text(body.title)}`,
      `LOCATION:${text([e.venue, e.address, e.addressEn].filter(Boolean).join(" · "))}`,
      `DESCRIPTION:${text(description)}`,
      `URL:${url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
