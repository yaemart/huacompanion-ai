import test from "node:test";
import assert from "node:assert/strict";
import {
  validateQuote,
  allowedTransition,
  publicQuote,
  canConfirmQuote,
} from "../src/lib/business.ts";
test("quotes use exact integer minor units and bounded lines", () => {
  const q = validateQuote(
    {
      title: "Airport help",
      scope: "Meet visitor",
      included: "Coordination",
      excluded: "Tickets",
      terms: "Subject to confirmation",
      currency: "CNY",
      expiresAt: "2026-06-01T00:00:00Z",
      lines: [{ label: "Coordination", quantity: 2, unitMinor: 12550 }],
    },
    Date.parse("2026-01-01"),
  );
  assert.equal(q.totalMinor, 25100);
  assert.throws(() =>
    validateQuote(
      { ...q, lines: [{ label: "x", quantity: 1, unitMinor: 1.5 }] },
      Date.parse("2026-01-01"),
    ),
  );
  assert.throws(() => validateQuote({ ...q, currency: "BTC" }, Date.parse("2026-01-01")));
  assert.throws(() => validateQuote({ ...q, expiresAt: "2020-01-01" }));
});
test("fulfilment cannot skip acceptance and confirmed resources", () => {
  assert.equal(allowedTransition("awaiting-confirmation", "scheduled", false, false), false);
  assert.equal(allowedTransition("accepted", "scheduled", true, false), false);
  assert.equal(allowedTransition("accepted", "scheduled", true, true), true);
  assert.equal(allowedTransition("scheduled", "in-service", true, true), true);
  assert.equal(allowedTransition("received", "completed", false, false), false);
  assert.equal(allowedTransition("completed", "aftercare", true, true), true);
});
test("confirmation rejects stale withdrawn expired or unissued quote", () => {
  const q = { id: 3, status: "sent", expiresAt: "2030-01-01", revision: 2 };
  assert.equal(canConfirmQuote(q, 3, Date.parse("2026-01-01")), true);
  assert.equal(canConfirmQuote(q, 4), false);
  assert.equal(canConfirmQuote({ ...q, status: "draft" }, 3), false);
  assert.equal(canConfirmQuote({ ...q, expiresAt: "2020-01-01" }, 3), false);
});
test("customer quote projection excludes cost staff and private notes", () => {
  const q = publicQuote({
    id: 1,
    title: "x",
    internalCostMinor: 12,
    notes: "secret",
    owner: 4,
    provider: 5,
    totalMinor: 20,
  });
  assert.equal("internalCostMinor" in q, false);
  assert.equal("notes" in q, false);
  assert.equal("provider" in q, false);
  assert.equal(q.totalMinor, 20);
});
