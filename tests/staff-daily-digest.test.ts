import test from "node:test";
import assert from "node:assert/strict";
import { staffDigestAt } from "../src/lib/staff-daily-digest.ts";
import { workflowEventTypes } from "../src/lib/workflow.ts";

test("routine progress enters the next 09:00 Beijing digest across day and year boundaries", () => {
  const release = (now: string) =>
    staffDigestAt(true, { type: "case-stage", routine: true }, Date.parse(now));
  assert.equal(release("2026-12-31T17:00:00Z"), "2027-01-01T01:00:00.000Z");
  assert.equal(release("2027-01-01T00:59:59.999Z"), "2027-01-01T01:00:00.000Z");
  assert.equal(release("2027-01-01T01:00:00.000Z"), "2027-01-02T01:00:00.000Z");
});

test("chosen preference only batches routine progress without a deadline", () => {
  const now = Date.parse("2027-01-01T00:00:00Z");
  assert.equal(staffDigestAt(false, { type: "case-stage", routine: true }, now), undefined);
  assert.equal(staffDigestAt(true, { type: "case-stage" }, now), undefined);
  const deadline = { type: "case-stage", routine: true, dueAt: "2027-01-01T00:30:00Z" } as const;
  assert.equal(staffDigestAt(true, deadline, now), undefined);
  for (const type of workflowEventTypes.filter((type) => type !== "case-stage"))
    assert.equal(staffDigestAt(true, { type, routine: true }, now), undefined, type);
});
