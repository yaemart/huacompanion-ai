import assert from "node:assert/strict";
import { test } from "node:test";
import {
  preparationRequest,
  preparationRecovery,
} from "../src/lib/subscription-campaign-preparation-client.ts";
import { MockTaskRequestError } from "../src/lib/subscription-campaign-task-client.ts";

const setting = {
  action: "set-mock-budget-local",
  input: { remaining: 2, reason: "虚构余额" },
} as const;
const reserve = {
  action: "reserve-mock-slot-local",
  input: {
    campaignKey: "00000000-0000-4000-8000-000000000000",
    revision: 1,
    key: "00000000-0000-4000-8000-000000000001",
  },
} as const;
const budget = {
  id: 1,
  configured: 2,
  remaining: 1,
  valid: true,
  reason: "虚构余额",
  expiresAt: "2030-01-01T01:00:00Z",
  asOf: "2030-01-01T00:00:00Z",
};
test("unknown setting recovers by reading only, never by resetting the same balance", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const bodies: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? new Response("not-json", { status: 503 })
      : Response.json({ budget });
  };
  await assert.rejects(preparationRequest(setting));
  const result = await preparationRequest(preparationRecovery(setting));
  assert.equal(result.kind, "read");
  assert.deepEqual(bodies, [setting, { action: "read-mock-budget-local", input: {} }]);
});
test("unknown reservation reuses its exact campaign, version and operation key", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const bodies: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? new Response("bad", { status: 503 })
      : Response.json({ reservation: { state: "already-reserved", id: 7 } });
  };
  await assert.rejects(preparationRequest(reserve));
  const result = await preparationRequest(preparationRecovery(reserve));
  assert.deepEqual(result, { kind: "reserve", reservation: { state: "already-reserved", id: 7 } });
  assert.deepEqual(bodies, [reserve, reserve]);
});
test("a confirmed setting is distinguishable from a current balance snapshot", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({ budget: { id: 9, remaining: 2, expiresAt: budget.expiresAt } });
  assert.deepEqual(await preparationRequest(setting), {
    kind: "set",
    budget: { id: 9, remaining: 2, expiresAt: budget.expiresAt },
  });
});
for (const [name, action, body] of [
  ["primitive success is uncertain", setting, { budget: "unexpected" }],
  [
    "a non-string reservation state is uncertain",
    reserve,
    { reservation: { state: ["reserved-local"], id: 7 } },
  ],
  ["missing receipt is uncertain", reserve, { updated: true }],
  [
    "a reservation without its slot number cannot enable a task",
    reserve,
    { reservation: { state: "reserved-local" } },
  ],
  [
    "invalid current balance cannot replace the snapshot",
    { action: "read-mock-budget-local", input: {} },
    { budget: { ...budget, remaining: -1 } },
  ],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(preparationRequest(action), (error: unknown) => {
      assert.ok(error instanceof MockTaskRequestError);
      assert.equal(error.uncertain, true);
      assert.doesNotMatch(error.message, /Unexpected|TypeError|not-json/);
      return true;
    });
  });
}
test("permission denial is definite and retains server guidance", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => Response.json({ error: "仅管理员可设置。" }, { status: 403 });
  await assert.rejects(preparationRequest(setting), (error: unknown) => {
    assert.ok(error instanceof MockTaskRequestError);
    assert.equal(error.uncertain, false);
    assert.equal(error.message, "仅管理员可设置。");
    return true;
  });
});
