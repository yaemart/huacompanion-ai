import assert from "node:assert/strict";
import test from "node:test";
test("CRM overview strict action-specific filters and canonical pagination", async () => {
  const { parseCrmOverviewQuery, overviewInput } = await import("../src/lib/crm-overview.ts");
  assert.deepEqual(
    parseCrmOverviewQuery(
      "http://local/?action=overviewList&kind=company&owner=mine&page=2&limit=50",
    ),
    {
      action: "overviewList",
      kind: "company",
      owner: "mine",
      page: 2,
      limit: 50,
      status: "active",
    },
  );
  for (const query of [
    "action=overviewList&teamID=01",
    "action=overviewList&page=1&page=2",
    "action=overviewList&owner=all",
    "action=overviewList&work=done",
    "action=overviewList&limit=51",
    "action=overview&clientID=1&q=secret",
    "action=overview&clientID=0",
    "action=assignmentQueue&target=all",
    "action=assignmentQueue&target=client&teamID=2",
    "action=overviewList&asOf=2090-01-01",
    "action=overviewList&actor=1",
    "action=overviewList&constructor=x",
  ])
    assert.throws(() => parseCrmOverviewQuery(`http://local/?${query}`), { status: 400 });
  assert.throws(() => overviewInput({ action: "overviewList", kind: ["company"] }), {
    status: 400,
  });
  assert.throws(() => overviewInput({ action: "overviewList", page: "1" }), { status: 400 });
  assert.throws(() => overviewInput({ action: "overviewList", q: "x".repeat(101) }), {
    status: 400,
  });
  assert.deepEqual(overviewInput({ action: "assignmentQueue", target: "inquiry" }), {
    action: "assignmentQueue",
    target: "inquiry",
    page: 1,
    limit: 20,
  });
});
test("CRM overview Beijing day is UTC+8, due today may already be overdue", async () => {
  const { overviewDay } = await import("../src/lib/crm-overview.ts");
  const asOf = "2026-11-28T00:00:00.000Z";
  const { start, end } = overviewDay(asOf);
  assert.equal(start, "2026-11-27T16:00:00.000Z");
  assert.equal(end, "2026-11-28T16:00:00.000Z");
  const due = "2026-11-27T23:00:00.000Z";
  assert.ok(due >= start && due < end && due < asOf);
  assert.deepEqual(overviewDay("2026-11-27T16:00:00.000Z"), { start, end });
  assert.throws(() => overviewDay("invalid"), { status: 503 });
});
