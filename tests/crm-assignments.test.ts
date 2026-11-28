import assert from "node:assert/strict";
import test from "node:test";
const key = "c41a13e4-75b7-40fd-b9e2-ae274b888de7";
const item = {
  inquiryID: 2,
  expectedUpdatedAt: "2026-11-28T00:00:00.000Z",
  expectedOwnerID: null,
  expectedCaseRevision: null,
};
const input = {
  action: "transferAssignments",
  clientID: 1,
  expectedClientRevision: 1,
  recipientID: 3,
  transferClient: false,
  inquiries: [item],
  reason: "  Fictional reviewed transfer  ",
  operationKey: key,
};
test("CRM transfer parser strictly validates selection, nested versions, reason and v4 key", async () => {
  const { parseTransferInput } = await import("../src/lib/crm-assignments.ts");
  const r = parseTransferInput({ ...input, inquiries: [{ ...item, inquiryID: 9 }, item] });
  assert.deepEqual(
    r.inquiries.map((x) => x.inquiryID),
    [2, 9],
  );
  assert.equal(r.reason, "Fictional reviewed transfer");
  assert.equal(
    parseTransferInput({ ...input, transferClient: true, inquiries: [] }).transferClient,
    true,
  );
  assert.equal(
    parseTransferInput({
      ...input,
      inquiries: Array.from({ length: 20 }, (_, i) => ({ ...item, inquiryID: i + 1 })),
    }).inquiries.length,
    20,
  );
  const bad = [
    { ...input, transferClient: false, inquiries: [] },
    { ...input, teamID: 1 },
    { ...input, force: true },
    { ...input, transferClient: "true" },
    { ...input, recipientID: 0 },
    { ...input, reason: "short" },
    { ...input, reason: "x".repeat(2001) },
    { ...input, operationKey: key.replace("40fd", "10fd") },
    { ...input, inquiries: [item, item] },
    { ...input, inquiries: Array.from({ length: 21 }, (_, i) => ({ ...item, inquiryID: i + 1 })) },
    ...[
      { ...item, actor: 1 },
      { ...item, expectedUpdatedAt: "2026-11-28" },
      { ...item, expectedUpdatedAt: "bad" },
      { ...item, expectedOwnerID: 0 },
      { ...item, expectedOwnerID: "2" },
      { ...item, expectedCaseRevision: 0 },
      { inquiryID: 2, expectedUpdatedAt: item.expectedUpdatedAt, expectedOwnerID: null },
    ].map((i) => ({ ...input, inquiries: [i] })),
  ];
  for (const raw of bad) assert.throws(() => parseTransferInput(raw), { status: 400 });
});
test("CRM transfer queries only accept canonical client and page values", async () => {
  const { parseAssignmentURL } = await import("../src/lib/crm-assignments.ts");
  assert.deepEqual(parseAssignmentURL("http://local/?action=transferPreview&clientID=1"), {
    action: "transferPreview",
    clientID: 1,
    page: 1,
    limit: 20,
  });
  for (const q of [
    "action=transferPreview&clientID=01",
    "action=transferPreview&clientID=1&limit=21",
    "action=assignmentHistory&clientID=1&limit=51",
    "action=assignmentHistory&clientID=1&page=1&page=2",
    "action=transferPreview&clientID=1&teamID=2",
  ])
    assert.throws(() => parseAssignmentURL("http://local/?" + q), { status: 400 });
});
test("CRM public action parser dispatches canonical transfers without changing legacy actions", async () => {
  const { parseCrmAction } = await import("../src/lib/crm.ts");
  assert.equal(parseCrmAction(input).action, "transferAssignments");
  assert.equal(
    parseCrmAction({
      action: "updateClient",
      clientID: 1,
      expectedRevision: 2,
      operationKey: key,
      displayName: "Original",
    }).action,
    "updateClient",
  );
});
