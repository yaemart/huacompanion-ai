import assert from "node:assert/strict";
import test from "node:test";
import {
  findingStatus,
  followupTotals,
  performanceMonth,
  taskAtCutoff,
} from "../src/lib/staff-monthly-performance.ts";

test("monthly report uses Beijing calendar boundaries, including year rollover", () => {
  const now = Date.parse("2027-01-31T16:00:00.000Z");
  const december = performanceMonth("2026-12", now);
  assert.equal(december?.start, "2026-11-30T16:00:00.000Z");
  assert.equal(december?.end, "2026-12-31T16:00:00.000Z");
  assert.equal(performanceMonth(undefined, now)?.month, "2027-02");
  assert.equal(performanceMonth("2027-02", now)?.through, "2027-01-31T16:00:00.000Z");
  for (const invalid of ["2027-02-01", "2027-13", "2027-03", ["2027-01"]])
    assert.equal(performanceMonth(invalid, now), null);
});

test("each finding stays pending through the appeal window or review, and can be removed", () => {
  const finding = { active: true, notifiedAt: "2026-11-30T16:00:00.000Z" };
  const closing = Date.parse("2026-12-08T16:00:00.000Z");
  assert.equal(findingStatus(finding, closing - 1), "window");
  assert.equal(findingStatus(finding, closing), "counted");
  assert.equal(findingStatus({ ...finding, appealAt: finding.notifiedAt }, closing), "review");
  assert.equal(
    findingStatus(
      { ...finding, appealAt: finding.notifiedAt, resolvedAt: finding.notifiedAt },
      closing,
    ),
    "counted",
  );
  assert.equal(findingStatus({ ...finding, active: false }, closing), null);
});

test("follow-up uses the active date and staff and cannot repair a missed deadline retroactively", () => {
  const day = (value: number) => new Date(Date.UTC(2026, 10, value));
  const event = (date: number, options: Partial<Parameters<typeof followupTotals>[0][number]>) => ({
    inquiry: "1",
    at: day(date),
    owner: null,
    ownerChanged: false,
    due: null,
    dueChanged: false,
    actor: null,
    action: "update",
    ...options,
  });
  const timeline = [
    event(1, { ownerChanged: true, owner: 3, dueChanged: true, due: day(5) }),
    event(2, { dueChanged: true, due: day(6) }),
    event(3, { ownerChanged: true, owner: 7 }),
    event(4, { actor: 3, action: "followup-appended" }),
    event(6, { actor: 7, action: "followup-appended" }),
    event(7, { dueChanged: true, due: day(8) }),
    event(9, { ownerChanged: true, owner: 3, dueChanged: true, due: day(30) }),
  ];
  const cutoff = "2026-11-25T00:00:00.000Z";
  assert.deepEqual(followupTotals(timeline, 7, day(1).toISOString(), cutoff), {
    due: 2,
    onTime: 1,
  });
  assert.deepEqual(followupTotals(timeline, 3, day(1).toISOString(), cutoff), {
    due: 0,
    onTime: 0,
  });
});

test("overdue review snapshot ignores completion or assignment after cutoff", () => {
  const task = {
    assignee: 4,
    due: "2026-11-04T00:00:00.000Z",
    history: [
      { at: "2026-11-02T00:00:00.000Z", action: "assign", assignee: 8 },
      { at: "2026-11-10T00:00:00.000Z", action: "done" },
    ],
  };
  assert.deepEqual(taskAtCutoff(task, "2026-11-09T00:00:00.000Z"), {
    assignee: 8,
    due: task.due,
    doneAt: null,
    canceled: false,
  });
  assert.equal(taskAtCutoff(task, "2026-11-11T00:00:00.000Z").doneAt, "2026-11-10T00:00:00.000Z");
});
