import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestMockTask,
  MockTaskRequestError,
  taskLeaseAfter,
} from "../src/lib/subscription-campaign-task-client.ts";

const token = "00000000-0000-4000-8000-000000000001";
const command = {
  action: "claim-mock-task-local",
  input: { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 1, slotId: 7 },
} as const;
const claimed = {
  state: "claimed-local",
  id: 99,
  token,
  expiresAt: "2030-01-01T00:00:00.000Z",
} as const;
test("a claim receipt binds its private credential to the selected slot, not the lease ID", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const before = JSON.stringify(command);
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/subscriptions/campaigns");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, before);
    return Response.json({ task: claimed });
  };
  const receipt = await requestMockTask(command);
  const lease = taskLeaseAfter(undefined, 7, command.action, receipt);
  assert.deepEqual(lease, { slotId: 7, token, expiresAt: claimed.expiresAt, phase: "claimed" });
  assert.equal(JSON.stringify(command), before);
  const attempting = {
    state: "attempting-local",
    id: 99,
    attempts: 1,
    nextAttemptAt: null,
    started: false,
  } as const;
  assert.equal(
    taskLeaseAfter(lease, 7, "begin-mock-attempt-local", attempting)?.phase,
    "attempting",
  );
  assert.equal(
    taskLeaseAfter(undefined, 7, command.action, attempting),
    undefined,
    "reading another active attempt never adopts credentials",
  );
  assert.equal(
    taskLeaseAfter(lease, 7, "record-mock-result-local", {
      state: "review-local",
      attempts: 1,
      nextAttemptAt: null,
      started: false,
    }),
    undefined,
  );
});
for (const [name, response, uncertain] of [
  [
    "network failure freezes the exact operation",
    () => {
      throw TypeError("Failed to fetch INTERNAL");
    },
    true,
  ],
  [
    "non-JSON response is uncertain and uses Chinese guidance",
    () => new Response("not-json", { status: 503 }),
    true,
  ],
  [
    "server failure does not imply rollback",
    () => Response.json({ error: "请核实当前任务。" }, { status: 503 }),
    true,
  ],
  [
    "permission rejection is definite",
    () => Response.json({ error: "请重新授权。" }, { status: 403 }),
    false,
  ],
  [
    "an invalid success cannot authorize an attempt",
    () => Response.json({ task: { ...claimed, token: "bad" } }),
    true,
  ],
  [
    "a primitive receipt remains a Chinese uncertain error",
    () => Response.json({ task: "unexpected" }),
    true,
  ],
  ["a missing receipt is uncertain", () => Response.json({ updated: true }), true],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => response();
    await assert.rejects(requestMockTask(command), (error: unknown) => {
      assert.ok(error instanceof MockTaskRequestError);
      assert.equal(error.uncertain, uncertain);
      assert.doesNotMatch(error.message, /INTERNAL|Unexpected token|not-json/);
      return true;
    });
  });
}
test("a replay sends the original task, credential, outcome and retry delay unchanged", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const value = {
    action: "record-mock-result-local",
    input: { ...command.input, token, outcome: "rate-limited", retryAfterMs: 120000 },
  } as const;
  const bodies: string[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    if (bodies.length === 1) return new Response("bad", { status: 503 });
    return Response.json({
      task: {
        state: "retry-local",
        attempts: 1,
        nextAttemptAt: "2030-01-01T00:00:00Z",
        started: false,
      },
    });
  };
  await assert.rejects(requestMockTask(value));
  assert.equal((await requestMockTask(value)).state, "retry-local");
  assert.deepEqual(bodies, [JSON.stringify(value), JSON.stringify(value)]);
});
test("shared cooldown accepts zero attempts and drops the page credential without claiming progress", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({
      task: {
        state: "cooldown-local",
        attempts: 0,
        nextAttemptAt: "2030-01-01T00:15:00.000Z",
        started: false,
      },
    });
  const receipt = await requestMockTask(command);
  assert.equal(receipt.state, "cooldown-local");
  assert.equal(
    taskLeaseAfter(
      { slotId: 7, token, expiresAt: claimed.expiresAt, phase: "claimed" },
      7,
      command.action,
      receipt,
    ),
    undefined,
  );
});
test("cooldown cannot claim a started attempt or replace a result receipt", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const task = {
    state: "cooldown-local",
    attempts: 0,
    nextAttemptAt: "2030-01-01T00:15:00.000Z",
    started: true,
  };
  globalThis.fetch = async () => Response.json({ task });
  await assert.rejects(requestMockTask(command), MockTaskRequestError);
  task.started = false;
  await assert.rejects(
    requestMockTask({
      ...command,
      action: "record-mock-result-local",
      input: { ...command.input, token, outcome: "accepted" },
    }),
    MockTaskRequestError,
  );
});
