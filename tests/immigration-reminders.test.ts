import test from "node:test";
import assert from "node:assert/strict";
import { policyReminderWindows, policyReminderKey } from "../src/lib/immigration-reminders.ts";

test("policy review thresholds use explicit calendar days including catch-up", () => {
  for (const [today, expected] of [
    ["2026-10-31", []],
    ["2026-11-01", [30]],
    ["2026-11-23", [30]],
    ["2026-11-24", [30, 7]],
    ["2026-12-01", [30, 7]],
    ["2026-12-02", [30, 7]],
  ] as const)
    assert.deepEqual(policyReminderWindows("2026-12-01", today), expected);
  assert.deepEqual(policyReminderWindows(null, "2026-11-01"), []);
  assert.deepEqual(policyReminderWindows("2026-02-30", "2026-11-01"), []);
  assert.deepEqual(policyReminderWindows("2028-03-01", "2028-02-23"), [30, 7]);
  assert.throws(() => policyReminderWindows("2026-12-01", "invalid"));
});
test("policy reminder identity includes formal version, expiry and threshold", () => {
  const key = policyReminderKey(12, 4, "2026-12-01", 30);
  assert.equal(key, policyReminderKey(12, 4, "2026-12-01", 30));
  for (const other of [
    policyReminderKey(13, 4, "2026-12-01", 30),
    policyReminderKey(12, 5, "2026-12-01", 30),
    policyReminderKey(12, 4, "2027-01-01", 30),
    policyReminderKey(12, 4, "2026-12-01", 7),
  ])
    assert.notEqual(key, other);
});
