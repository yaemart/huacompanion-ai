import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campaignReviewReason,
  type ReviewAttempt,
} from "../src/lib/subscription-campaign-review.ts";

const now = Date.parse("2026-11-23T12:00:00Z");
const base: ReviewAttempt = {
  state: "attempting",
  attemptedAt: ["2026-11-23T11:00:00Z"],
  lastOutcome: null,
  completed: false,
  expires: now + 1,
};
const five = [
  "2026-11-23T07:00:00Z",
  "2026-11-23T08:00:00Z",
  "2026-11-23T09:00:00Z",
  "2026-11-23T10:00:00Z",
  "2026-11-23T11:00:00Z",
];
for (const [name, patch, want] of [
  ["active attempt remains outside review", {}, null],
  ["expired started lease requires checking", { expires: now }, "interrupted"],
  ["missing started lease requires checking", { expires: null }, "interrupted"],
  [
    "23 hour boundary stops retries",
    { state: "retry", attemptedAt: ["2026-11-22T13:00:00Z"] },
    "window-expired",
  ],
  [
    "five consumed retry attempts require checking",
    { state: "retry", attemptedAt: five },
    "attempt-limit",
  ],
  ["a fifth attempt still in flight is not prematurely stopped", { attemptedAt: five }, null],
  [
    "recorded unknown remains the cause after aging",
    { state: "review", lastOutcome: "unknown", expires: now },
    "unknown",
  ],
  [
    "stored review does not invent a historical interruption",
    { state: "review", expires: now },
    "unspecified",
  ],
  ["successful lease takes precedence over expiration", { completed: true, expires: now }, null],
  [
    "completed attempt takes precedence over expiration",
    { state: "completed", expires: now },
    null,
  ],
  [
    "permanent failure takes precedence over exhausted budget",
    { state: "failed", attemptedAt: five },
    null,
  ],
  [
    "temporary retry below limits remains outside review",
    { state: "retry", lastOutcome: "temporary" },
    null,
  ],
] as const) {
  test(name, () => assert.equal(campaignReviewReason({ ...base, ...patch }, now), want));
}
test("stored review never acquires a cause merely because more time has passed", () => {
  const saved = { ...base, state: "review" as const, expires: now };
  assert.equal(campaignReviewReason(saved, now), "unspecified");
  assert.equal(campaignReviewReason(saved, now + 24 * 3600000), "unspecified");
});
test("a stored fifth interrupted attempt does not prove the retry limit caused review", () => {
  assert.equal(
    campaignReviewReason({ ...base, state: "review", attemptedAt: five, expires: now }, now),
    "unspecified",
  );
});
