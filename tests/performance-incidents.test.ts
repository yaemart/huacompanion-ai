import test from "node:test";
import assert from "node:assert/strict";
import {
  appealClosesAt,
  canAppeal,
  incidentPhase,
  normalizedIssue,
  independentReviewer,
} from "../src/lib/performance-incidents.ts";

test("appeal includes seven full Beijing calendar days after the notice day", () => {
  const notifiedAt = "2026-11-29T16:01:00.000Z";
  const closes = "2026-12-07T16:00:00.000Z";
  assert.equal(appealClosesAt(notifiedAt), closes);
  assert.ok(canAppeal({ active: true, notifiedAt }, Date.parse(closes) - 1));
  assert.equal(canAppeal({ active: true, notifiedAt }, Date.parse(closes)), false);
  assert.equal(
    canAppeal({ active: true, notifiedAt, appealAt: notifiedAt }, Date.parse(notifiedAt)),
    false,
  );
  assert.equal(canAppeal({ active: false, notifiedAt }, Date.parse(notifiedAt)), false);
});

test("confirmed findings are pending through appeals; closed cases keep first confirmation month", () => {
  const at = "2026-11-29T16:01:00.000Z";
  const late = Date.parse("2026-12-10T00:00:00Z");
  const confirmed = { state: "confirmed" as const, firstConfirmedAt: at };
  assert.deepEqual(incidentPhase(confirmed, [{ active: true, notifiedAt: at }], Date.parse(at)), {
    state: "pending",
    month: "2026-11",
  });
  assert.deepEqual(
    incidentPhase(confirmed, [{ active: true, notifiedAt: at, appealAt: at }], late),
    { state: "pending", month: "2026-11" },
  );
  assert.deepEqual(
    incidentPhase(
      confirmed,
      [{ active: true, notifiedAt: at, appealAt: at, resolvedAt: at }],
      late,
    ),
    { state: "confirmed", month: "2026-11" },
  );
  assert.deepEqual(incidentPhase({ ...confirmed, state: "dismissed" }, [], late), {
    state: "dismissed",
    month: "2026-11",
  });
});

test("normalizes spelling and formatting of the same issue and blocks involved reviewers", () => {
  assert.equal(normalizedIssue("  ＡＢＣ – 费用有误。"), normalizedIssue("abc费用有误"));
  assert.equal(independentReviewer(4, [1, 4, 5], 8), false);
  assert.equal(independentReviewer(8, [1, 4, 5], 8), false);
  assert.equal(independentReviewer(7, [1, 4, 5], 8), true);
});
