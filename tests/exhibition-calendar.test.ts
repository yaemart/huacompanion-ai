import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyExhibition } from "../src/lib/exhibitions.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
import { locales } from "../src/lib/locales.ts";

const api = await import("../src/lib/exhibition-calendar.ts").catch(() => null);
const stamp = new Date("2026-11-26T01:02:03.456Z");
const origin = "https://calendar.example.invalid";
const fixture = (): ContentBody => ({
  kind: "exhibition",
  contentKey: "fictional-calendar",
  slug: "fictional-fair",
  locale: "zh",
  title: "虚构日历展会",
  summary: "虚构测试资料",
  blocks: [],
  sources: [],
  publishedAt: "2026-11-25T12:13:14.000Z",
  publicationRevision: 7,
  exhibition: {
    ...emptyExhibition(),
    status: "announced",
    startDate: "2024-02-28",
    endDate: "2024-03-01",
    venue: "虚构场馆",
    address: "虚构地址",
    addressEn: "Fictional address",
    officialURL: "https://example.invalid/official",
    verifiedAt: "2026-11-25",
  },
});
function build(body = fixture(), site = origin) {
  assert.ok(api?.buildExhibitionCalendar, "calendar serialization is required");
  const text = api.buildExhibitionCalendar(body, site, stamp);
  assert.ok(text);
  return text;
}
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");
const uid = (body: ContentBody) => unfold(build(body)).match(/^UID:(.+)$/m)![1];

test("calendar preserves the inclusive last day across a leap day", () => {
  const text = unfold(build());
  assert.match(text, /DTSTART;VALUE=DATE:20240228\r\n/);
  assert.match(text, /DTEND;VALUE=DATE:20240302\r\n/);
  assert.match(text, /DTSTAMP:20261126T010203Z\r\n/);
  assert.match(text, /LAST-MODIFIED:20261125T121314Z\r\n/);
  assert.match(text, /SEQUENCE:7\r\n/);
  assert.match(text, /URL:https:\/\/calendar.example.invalid\/zh\/exhibitions\/fictional-fair\r\n/);
  assert.match(text, /LOCATION:虚构场馆/);
  assert.match(text, /Fictional address/);
  assert.match(text, /example.invalid\/official/);
  assert.doesNotMatch(text, /TZID|VALARM|ATTENDEE|ORGANIZER|METHOD:|RRULE/);
  assert.equal(text.match(/^BEGIN:VEVENT$/gm)?.length, 1);
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
});
for (const [startDate, endDate, end] of [
  ["2099-12-29", "2100-01-02", "21000103"],
  ["2024-02-29", "2024-02-29", "20240301"],
  ["2026-12-31", "2026-12-31", "20270101"],
] as const)
  test("calendar computes next-day DATE for " + endDate, () => {
    const body = fixture();
    Object.assign(body.exhibition!, { startDate, endDate });
    assert.ok(unfold(build(body)).includes("DTEND;VALUE=DATE:" + end + "\r\n"));
  });
for (const status of ["pending", "postponed", "cancelled"] as const)
  test("calendar refuses " + status + " even with old dates", () => {
    const body = fixture();
    body.exhibition!.status = status;
    assert.ok(api);
    assert.equal(api.canExportExhibitionCalendar(body), false);
    assert.equal(api.buildExhibitionCalendar(body, origin, stamp), null);
  });
for (const [startDate, endDate] of [
  ["", ""],
  ["2026-03-01", ""],
  ["2026-02-30", "2026-03-01"],
  ["2026-03-02", "2026-03-01"],
  ["0000-01-01", "0000-01-02"],
  ["9999-12-30", "9999-12-31"],
])
  test("calendar rejects incomplete or nonrepresentable range " + startDate + "/" + endDate, () => {
    const body = fixture();
    Object.assign(body.exhibition!, { startDate, endDate });
    assert.ok(api);
    assert.equal(api.canExportExhibitionCalendar(body), false);
    assert.equal(api.buildExhibitionCalendar(body, origin, stamp), null);
  });
test("historical ended events and legacy bodies without optional phase keys still export", () => {
  const body = fixture();
  body.exhibition!.status = "ended";
  delete body.exhibition!.phases;
  const before = JSON.stringify(body);
  assert.match(unfold(build(body)), /SUMMARY:虚构日历展会/);
  assert.equal(JSON.stringify(body), before);
});
test("calendar refuses an ended display projection whose published dates were unconfirmed", () => {
  assert.ok(api);
  const body = { ...fixture(), calendarExportable: false };
  body.exhibition!.status = "ended";
  assert.equal(api.canExportExhibitionCalendar(body), false);
  assert.equal(api.buildExhibitionCalendar(body, origin, stamp), null);
});
test("calendar does not export another content type or missing exhibition", () => {
  assert.ok(api);
  assert.equal(api.canExportExhibitionCalendar({ ...fixture(), kind: "guide" }), false);
  assert.equal(api.canExportExhibitionCalendar({ ...fixture(), exhibition: undefined }), false);
});
test("calendar UID survives date, slug, title and revision changes but distinguishes language and key", () => {
  const body = fixture();
  const original = uid(body);
  const next = {
    ...body,
    title: "改名",
    slug: "changed-name",
    publicationRevision: 8,
    exhibition: { ...body.exhibition!, startDate: "2027-01-01", endDate: "2027-01-03" },
  };
  assert.equal(uid(next), original);
  assert.notEqual(uid({ ...body, locale: "en" }), original);
  assert.notEqual(uid({ ...body, contentKey: "other-fair" }), original);
  assert.equal(unfold(build(body, "http://127.0.0.1:3188")).match(/^UID:(.+)$/m)![1], original);
});
test("calendar TEXT escaping prevents a title from injecting properties or events", () => {
  const body = fixture();
  body.title = "虚构,展会;路径\\\r\nEND:VEVENT\r\nBEGIN:VEVENT\nATTENDEE:evil\u0000";
  const text = unfold(build(body));
  assert.ok(
    text.includes("SUMMARY:虚构\\,展会\\;路径\\\\\\nEND:VEVENT\\nBEGIN:VEVENT\\nATTENDEE:evil\r\n"),
  );
  assert.equal(text.match(/^BEGIN:VEVENT$/gm)?.length, 1);
  assert.doesNotMatch(text, /^ATTENDEE:/m);
  assert.equal(text.includes("\u0000"), false);
  assert.equal(text.replaceAll("\r\n", "").includes("\n"), false);
});
test("UTF-8 folds at 75 octets without splitting multilingual characters or emoji", () => {
  const body = fixture();
  body.title = "中文🙂العربية".repeat(50);
  const text = build(body);
  for (const line of text.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(line)), line);
  }
  assert.ok(unfold(text).includes("SUMMARY:" + body.title + "\r\n"));
});
for (const locale of locales)
  test("calendar includes one event and phase explanation in " + locale, () => {
    const body = fixture();
    body.locale = locale;
    body.exhibition!.phases = [
      { name: "Fictional phase", startDate: "", endDate: "", theme: "Fictional tools" },
    ];
    const text = unfold(build(body));
    assert.ok(text.includes("Fictional phase"));
    assert.ok(text.includes("Fictional tools"));
    assert.ok(text.includes(`/${locale}/exhibitions/fictional-fair`));
    assert.equal(text.match(/^BEGIN:VEVENT$/gm)?.length, 1);
  });
for (const origin of [
  "file:///tmp/test",
  "javascript:alert(1)",
  "https://user:pass@example.invalid",
])
  test("calendar refuses unsafe configured URL " + new URL(origin).protocol, () => {
    assert.ok(api);
    assert.throws(() => api.buildExhibitionCalendar(fixture(), origin, stamp));
  });
