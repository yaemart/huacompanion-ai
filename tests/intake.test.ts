import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntake } from "../src/lib/intake-validation.ts";
const valid = {
  kind: "request",
  locale: "en",
  values: {
    categories: ["business"],
    city: " Shanghai ",
    people: "2",
    datesUnknown: true,
    name: " Alex ",
    email: "alex@example.com",
    language: "English",
    consent: true,
  },
};
test("server accepts valid intake and removes internal fields", () => {
  const p = parseIntake({
    ...valid,
    values: {
      ...valid.values,
      owner: 1,
      status: "won",
      role: "admin",
      notes: "secret",
    },
  });
  assert.equal(p.values.city, "Shanghai");
  assert.equal(p.values.owner, undefined);
  assert.equal(p.values.notes, undefined);
});
test("server rejects malformed category and consent types", () => {
  assert.throws(() =>
    parseIntake({
      ...valid,
      values: { ...valid.values, categories: ["invented"] },
    }),
  );
  assert.throws(() => parseIntake({ ...valid, values: { ...valid.values, consent: "true" } }));
});
test("server rejects impossible dates and excessive text", () => {
  assert.throws(() =>
    parseIntake({
      ...valid,
      values: {
        ...valid.values,
        datesUnknown: false,
        arrivalDate: "2027-02-30",
      },
    }),
  );
  assert.throws(() =>
    parseIntake({
      ...valid,
      values: { ...valid.values, description: "a".repeat(2001) },
    }),
  );
});
test("server enforces all step checks, not just consent", () => {
  assert.throws(() => parseIntake({ ...valid, values: { ...valid.values, name: " " } }));
});

test("server ignores stale dates from hidden fields", () => {
  const p = parseIntake({
    ...valid,
    values: { ...valid.values, checkIn: "2027-02-30", arrivalDate: "bad-date" },
  });
  assert.equal(p.values.checkIn, undefined);
  assert.equal(p.values.arrivalDate, undefined);
});

test("intake preserves each supported locale rather than coercing it", () => {
  for (const locale of ["zh", "en", "es", "fr", "de", "it", "ar"])
    assert.equal(parseIntake({ ...valid, locale }).locale, locale);
  for (const locale of ["ja", "", null]) assert.throws(() => parseIntake({ ...valid, locale }));
});
