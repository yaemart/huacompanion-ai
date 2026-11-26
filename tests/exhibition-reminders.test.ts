import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { emptyExhibition } from "../src/lib/exhibitions.ts";
import { planExhibitionReminder, type ReminderState } from "../src/lib/exhibition-reminders.ts";

const scope = { key: "fair-2027", locale: "zh" as const };
const state: ReminderState = {
  source: {
    id: 10,
    revision: 2,
    body: {
      kind: "exhibition",
      locale: "zh",
      contentKey: "fair-2027",
      slug: "spring-fair",
      title: "Approved <fair>",
      blocks: [],
      sources: [],
      exhibition: {
        ...emptyExhibition(),
        status: "announced",
        startDate: "2027-03-10",
        endDate: "2027-03-12",
        venue: "Approved venue",
        address: "Approved address",
      },
    },
  },
  subscriptions: [
    {
      id: 1,
      email: "A@example.invalid",
      topic: "exhibition:fair-2027",
      locale: "zh",
      status: "confirmed",
      consentVersion: 1,
      privacyVersion: "v1",
      confirmedAt: "2026-01-01T00:00:00Z",
      consentedAt: "2026-01-01T00:00:00Z",
    },
  ],
  jobs: [],
  suppressed: [],
};
const plan = (s = state, today = "2027-02-08") => planExhibitionReminder(s, scope, today, "v1");
for (const [today, expected] of [
  ["2027-02-07", null],
  ["2027-02-08", 30],
  ["2027-02-09", null],
  ["2027-03-02", null],
  ["2027-03-03", 7],
  ["2027-03-04", null],
  ["2027-03-10", null],
  ["2027-03-11", null],
] as const)
  test(`exact calendar window ${today}`, () => {
    const p = plan(state, today);
    assert.equal(p.offset, expected);
    assert.equal(p.create.length, expected ? 1 : 0);
  });
for (const [start, today, offset] of [
  ["2028-03-01", "2028-01-31", 30],
  ["2028-03-01", "2028-02-23", 7],
  ["2027-01-02", "2026-12-03", 30],
] as const)
  test(`natural days across leap or year boundary ${start}/${today}`, () => {
    const s = structuredClone(state);
    s.source!.body.exhibition!.startDate = start;
    s.source!.body.exhibition!.endDate = start;
    assert.equal(plan(s, today).offset, offset);
  });
test("invalid calendar input cannot create", () => {
  assert.throws(() => plan(state, "2027-02-29"));
  const s = structuredClone(state);
  s.source!.body.exhibition!.startDate = "2027-02-30";
  assert.equal(plan(s).create.length, 0);
});
for (const status of ["pending", "postponed", "cancelled", "ended"] as const)
  test(`raw ${status} never uses leftover dates`, () => {
    const s = structuredClone(state);
    s.source!.body.exhibition!.status = status;
    assert.equal(plan(s).create.length, 0);
  });
test("same-language published source and topic only; no inference from next edition", () => {
  const s = structuredClone(state);
  s.source!.body.locale = "en";
  assert.equal(plan(s).create.length, 0);
  s.source = undefined;
  assert.equal(plan(s).create.length, 0);
  s.subscriptions[0].topic = "exhibition-alerts";
  assert.equal(plan({ ...state, subscriptions: s.subscriptions }).create.length, 0);
});
test("latest normalized withdrawal wins over older confirmation", () => {
  const s = structuredClone(state);
  s.subscriptions.push({
    ...s.subscriptions[0],
    id: 2,
    email: " a@EXAMPLE.invalid ",
    status: "unsubscribed",
    consentedAt: "2026-02-01T00:00:00Z",
  });
  assert.equal(plan(s).create.length, 0);
});
for (const [name, patch] of [
  ["pending", { status: "pending" }],
  ["missing confirmation", { confirmedAt: null }],
  ["old privacy", { privacyVersion: "v0" }],
  ["wrong language", { locale: "en" }],
  ["invalid version", { consentVersion: 0 }],
  ["invalid email", { email: "broken" }],
] as const)
  test(`ineligible ${name} is excluded`, () => {
    assert.equal(
      plan({ ...state, subscriptions: [{ ...state.subscriptions[0], ...patch }] }).create.length,
      0,
    );
  });
test("suppression is not removed by reconfirmation", () => {
  const hash = createHash("sha256").update("a@example.invalid").digest("hex");
  assert.equal(plan().create[0].body.recipientHash, hash);
  assert.equal(plan({ ...state, suppressed: [hash] }).create.length, 0);
});
test("stable records, cancelled terminal, and new-publication invalidation", () => {
  const p = plan();
  const job = { ...p.create[0], id: 50 };
  assert.equal(plan({ ...state, jobs: [job] }).create.length, 0);
  assert.equal(plan({ ...state, jobs: [job] }).counts.existing, 1);
  const expired = plan({ ...state, jobs: [job] }, "2027-02-09");
  assert.deepEqual(expired.cancel, [{ id: 50, reason: "window-changed" }]);
  assert.equal(
    plan({ ...state, jobs: [{ ...job, body: { ...job.body, status: "local-cancelled" } }] }).create
      .length,
    0,
  );
  const newer = structuredClone(state);
  newer.source!.revision = 3;
  newer.jobs = [job];
  assert.deepEqual(plan(newer).cancel, [{ id: 50, reason: "source-changed" }]);
  assert.equal(plan(newer).create.length, 1);
});
test("private input is not copied into minimal snapshot and input is not mutated", () => {
  const s = structuredClone(state);
  const before = structuredClone(s);
  const p = plan(s);
  assert.deepEqual(s, before);
  assert.deepEqual(
    Object.keys(p.snapshot!).sort(),
    [
      "id",
      "revision",
      "contentKey",
      "locale",
      "title",
      "startDate",
      "endDate",
      "venue",
      "address",
      "path",
    ].sort(),
  );
  assert.equal(p.snapshot!.path, "/zh/exhibitions/spring-fair");
  assert.doesNotMatch(JSON.stringify(p.snapshot), /example.invalid|confirmedAt|sources|blocks/);
});
test("1001 eligible recipients fails entirely", () => {
  const subscriptions = Array.from({ length: 1001 }, (_, i) => ({
    ...state.subscriptions[0],
    id: i + 1,
    email: `fake-${i}@example.invalid`,
  }));
  assert.throws(() => plan({ ...state, subscriptions }), /1000/);
});
test("fractional PostgreSQL timestamps use chronological newest consent", () => {
  const s = structuredClone(state);
  s.subscriptions[0].consentedAt = "2026-11-26 00:00:00+00";
  s.subscriptions.push({
    ...s.subscriptions[0],
    id: 2,
    email: " a@EXAMPLE.invalid ",
    status: "unsubscribed",
    consentedAt: "2026-11-26 00:00:00.1+00",
  });
  assert.equal(plan(s).create.length, 0);
});
test("scope property order cannot change reminder identity or fingerprint", () => {
  const a = plan();
  const b = planExhibitionReminder(state, { locale: "zh", key: scope.key }, "2027-02-08", "v1");
  assert.equal(a.create[0].key, b.create[0].key);
  assert.equal(a.fingerprint, b.fingerprint);
});

test("PostgreSQL fractional timestamps sort by instant, latest withdrawal wins", () => {
  const s = structuredClone(state);
  s.subscriptions[0].consentedAt = "2026-11-26 12:00:00+00";
  s.subscriptions.push({
    ...s.subscriptions[0],
    id: 2,
    email: " a@example.invalid ",
    status: "unsubscribed",
    consentedAt: "2026-11-26 12:00:00.001+00",
  });
  assert.equal(plan(s).create.length, 0);
});
test("expired/unavailable/terminal records are not currently eligible and cancellation survives 1001 subscribers", () => {
  const first = plan();
  const held = { id: 1, ...first.create[0] };
  const unavailable = { ...state, source: undefined, jobs: [held] };
  const result = plan(unavailable);
  assert.equal(result.counts.eligible, 0);
  assert.equal(result.counts.cancel, 1);
  const many = {
    ...unavailable,
    subscriptions: Array.from({ length: 1001 }, (_, i) => ({
      ...state.subscriptions[0],
      id: i + 1,
      email: `${i}@example.invalid`,
    })),
  };
  assert.equal(plan(many).counts.cancel, 1);
  assert.equal(plan({ ...state, jobs: [held] }, "2027-02-09").counts.eligible, 0);
  assert.equal(
    plan({ ...state, jobs: [{ ...held, body: { ...held.body, status: "local-cancelled" } }] })
      .counts.eligible,
    0,
  );
});
