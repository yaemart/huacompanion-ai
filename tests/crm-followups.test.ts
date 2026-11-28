import { crmQuery } from "../src/lib/crm-http-query.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { parseFollowupCommand, parseFollowupQuery } from "../src/lib/crm-followups.ts";
const base = {
  action: "createFollowup",
  operationKey: "10000000-0000-4000-8000-000000000001",
  context: { kind: "client", id: 1, revision: 1 },
  title: "Call",
  description: "",
  dueAt: "2026-11-28T02:00:00.000Z",
  assigneeID: 2,
};
test("followup commands reject spoofed fields and primary sources before C2", () => {
  assert.equal(parseFollowupCommand(base).action, "createFollowup");
  for (const patch of [
    { actor: 1 },
    { type: "primary" },
    { dueAt: "" },
    { dueAt: "2026-02-30T01:00:00Z" },
    { dueAt: "2026-11-28" },
    { assigneeID: 0 },
    { operationKey: "x" },
  ])
    assert.throws(() => parseFollowupCommand({ ...base, ...patch }), { status: 400 });
  assert.throws(() =>
    parseFollowupCommand({
      ...base,
      context: { kind: "client", id: 1, revision: 1, inquiryID: 2 },
    }),
  );
});
test("postpone requires revision and meaningful reason; completion explicitly selects continuation", () => {
  const action = {
    action: "postponeFollowup",
    context: base.context,
    operationKey: base.operationKey,
    taskID: 2,
    expectedRevision: 1,
    dueAt: base.dueAt,
    reason: "Needs another conversation",
  };
  assert.equal(parseFollowupCommand(action).action, "postponeFollowup");
  assert.throws(() => parseFollowupCommand({ ...action, reason: "short" }));
  assert.throws(() => parseFollowupCommand({ ...action, expectedRevision: 0 }));
  const complete = {
    action: "completeFollowup",
    context: base.context,
    operationKey: base.operationKey,
    taskID: 2,
    expectedRevision: 1,
    body: "Completed call",
    continuation: { kind: "end", reason: "No further action for this item" },
  };
  assert.equal(parseFollowupCommand(complete).action, "completeFollowup");
  assert.throws(() => parseFollowupCommand({ ...complete, continuation: undefined }));
});
test("assignment selection rejects duplicates and oversized batches; query rejects duplicate fields", () => {
  const assign = {
    action: "assignFollowups",
    context: base.context,
    operationKey: base.operationKey,
    assigneeID: 2,
    tasks: [{ taskID: 3, expectedRevision: 1 }],
  };
  assert.equal(parseFollowupCommand(assign).action, "assignFollowups");
  assert.throws(() =>
    parseFollowupCommand({ ...assign, tasks: [assign.tasks[0], assign.tasks[0]] }),
  );
  assert.throws(() =>
    parseFollowupCommand({
      ...assign,
      tasks: Array.from({ length: 21 }, (_, i) => ({ taskID: i + 1, expectedRevision: 1 })),
    }),
  );
  assert.deepEqual(
    parseFollowupQuery("http://local/api/crm?action=followupList&kind=inquiry&id=3"),
    { action: "followupList", context: { kind: "inquiry", id: 3 }, page: 1, limit: 20 },
  );
  assert.throws(() =>
    parseFollowupQuery("http://local/api/crm?action=followupList&kind=client&id=3&id=4"),
  );
});

test("shared CRM query router accepts followup context and preserves strict duplicate rejection", () => {
  const url = "http://local/api/crm?action=followupList&kind=client&id=3";
  assert.deepEqual(crmQuery(url), {
    action: "followupList",
    context: { kind: "client", id: 3 },
    page: 1,
    limit: 20,
  });
  assert.throws(() => crmQuery(url + "&kind=inquiry"), { status: 400 });
});
