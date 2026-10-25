import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStep, visibleReviewValues } from "../src/lib/forms.ts";
const valid = {
  categories: ["business"],
  city: "Shanghai",
  datesUnknown: true,
  people: "2",
  name: "Alex",
  email: "alex@example.com",
  language: "English",
  consent: true,
};
test("requires a service selection and nonblank city", () => {
  const e = validateStep("request", 0, { categories: [], city: "  " }, "en");
  assert.ok(e.categories);
  assert.ok(e.city);
});
test("rejects invalid email and whitespace-only names", () => {
  const e = validateStep(
    "request",
    2,
    { name: "  ", email: "not-an-email", language: "English" },
    "en",
  );
  assert.ok(e.name);
  assert.ok(e.email);
});
test("requires positive whole-number party size and known date or unknown flag", () => {
  const e = validateStep("request", 1, { people: "-2.5" }, "en");
  assert.ok(e.people);
  assert.ok(e.arrivalDate);
});
test("long stays have a lease-duration field independent of short-stay dates", () => {
  const e = validateStep(
    "request",
    1,
    {
      people: "2",
      datesUnknown: true,
      categories: ["stays"],
      stayType: "long",
    },
    "zh",
  );
  assert.ok(e.leaseLength);
});
test("requires consent on final review", () =>
  assert.ok(validateStep("request", 3, { consent: false }, "en").consent));
test("accepts an approximate visit without invented dates", () =>
  assert.deepEqual(validateStep("request", 1, valid, "en"), {}));
test("provider contact requires phone and capability description", () => {
  assert.ok(validateStep("apply", 1, {}, "en").capabilities);
  assert.ok(
    validateStep("apply", 2, { name: "A", email: "a@b.com" }, "en").phone,
  );
});
test("hidden short-stay dates do not block a long stay or removed category", () => {
  const dates = {
    people: "2",
    datesUnknown: true,
    checkIn: "2026-12-10",
    checkOut: "2026-12-01",
  };
  assert.deepEqual(
    validateStep(
      "request",
      1,
      {
        ...dates,
        categories: ["stays"],
        stayType: "long",
        leaseLength: "3 months",
      },
      "en",
    ),
    {},
  );
  assert.deepEqual(
    validateStep("request", 1, { ...dates, categories: ["business"] }, "en"),
    {},
  );
});

test("review omits unselected category fields without deleting recoverable input", () => {
  const values = {
    categories: ["business"],
    industry: "Tools",
    medicalHelp: "Appointment",
    checkIn: "2026-12-01",
    stayType: "short",
    people: "2",
  };
  const review = visibleReviewValues(values);
  assert.equal(review.industry, "Tools");
  assert.equal(review.medicalHelp, undefined);
  assert.equal(review.checkIn, undefined);
  assert.equal(values.medicalHelp, "Appointment");
});
