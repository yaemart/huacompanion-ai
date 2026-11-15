import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultScorecardRules,
  observationMode,
  observeMetric,
  pointsForExample,
  validateScorecardRules,
} from "../src/lib/staff-scorecard.ts";

test("three Beijing trial months cross the year and never activate formal scoring", () => {
  assert.equal(observationMode("2026-11", "2026-12"), "unconfigured");
  assert.equal(observationMode("2026-12", "2026-12"), "trial");
  assert.equal(observationMode("2027-02", "2026-12"), "trial");
  assert.equal(observationMode("2027-03", "2026-12"), "recording");
  assert.equal(observationMode("2030-01", "2026-12"), "recording");
});

test("default roles fix the approved weights, units and thresholds", () => {
  const r = defaultScorecardRules();
  assert.deepEqual(r.templates.operations.response, {
    weight: 25,
    target: 1440,
    zero: 2880,
    minimum: 5,
  });
  assert.deepEqual(r.templates.operations.followup, {
    weight: 45,
    target: 90,
    zero: 60,
    minimum: 5,
  });
  assert.deepEqual(r.templates.operations.complaints, {
    weight: 30,
    target: 0,
    zero: 3,
    minimum: 5,
  });
  assert.equal(r.templates.editor.corrections.weight, 60);
  assert.equal(r.templates.editor.overdue.minimum, 3);
  assert.equal(r.templates.reviewer.reviewTime.weight, 30);
  assert.equal(r.templates.reviewer.corrections.weight, 40);
  assert.equal(r.templates.reviewer.overdue.weight, 30);
  assert.equal(r.templates.reviewer.returnRate.weight, 0);
  assert.deepEqual(validateScorecardRules(r), r);
  r.templates.operations.followup.weight = 46;
  assert.throws(() => validateScorecardRules(r), /100/);
  r.templates.operations.followup.weight = 45;
  r.templates.operations.followup.zero = 95;
  assert.throws(() => validateScorecardRules(r), /零分/);
  assert.throws(() => validateScorecardRules({ ...defaultScorecardRules(), formal: true }), /配置/);
});

test("sample gaps, positive evidence and personal pending stay distinct during observation", () => {
  const rule = defaultScorecardRules().templates.operations.complaints;
  assert.equal(observeMetric("complaints", rule, { value: 0, samples: 0 }).status, "insufficient");
  assert.equal(observeMetric("complaints", rule, { value: 0, samples: 5 }).status, "eligible");
  assert.equal(observeMetric("complaints", rule, { value: 1, samples: 0 }).status, "eligible");
  assert.equal(
    observeMetric("complaints", rule, { value: 0, samples: 10, pending: 1 }).status,
    "pending",
  );
  const observed = observeMetric("complaints", rule, { value: 1, samples: 5 });
  assert.equal("score" in observed || "points" in observed, false);
  assert.equal(pointsForExample("complaints", rule, 1.5), 15);
  assert.equal(pointsForExample("complaints", rule, 0), 30);
  assert.equal(pointsForExample("complaints", rule, 5), 0);
});
