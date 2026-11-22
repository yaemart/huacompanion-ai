import assert from "node:assert/strict";
import { test } from "node:test";
import { requestNextMockSlot } from "../src/lib/subscription-campaign-scheduling-client.ts";
const input = { campaignKey: "00000000-0000-4000-8000-000000000001", revision: 1 };
const asOf = "2030-01-01T00:00:00.000Z";
for (const [name, nextTask] of [
  ["available task", { slotId: 7, nextAttemptAt: null, asOf }],
  ["waiting", { slotId: null, nextAttemptAt: "2030-01-01T00:00:30.000Z", asOf }],
  ["empty", { slotId: null, nextAttemptAt: null, asOf }],
] as const) {
  test(`scheduler reads ${name} without turning selection into a claim`, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        action: "read-next-mock-slot-local",
        input,
      });
      return Response.json({ nextTask });
    };
    assert.deepEqual(await requestNextMockSlot(input), nextTask);
  });
}
for (const [name, payload] of [
  ["primitive", true],
  ["invalid slot", { slotId: -1, nextAttemptAt: null, asOf }],
  ["missing clock", { slotId: 1, nextAttemptAt: null }],
  ["invalid wait", { slotId: null, nextAttemptAt: "bad", asOf }],
] as const) {
  test(`scheduler rejects ${name} instead of claiming another task`, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => Response.json({ nextTask: payload });
    await assert.rejects(requestNextMockSlot(input), /自动领取已停止/);
  });
}
test("selection failures keep Chinese stop guidance and do not run a claim", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => new Response("not-json", { status: 503 });
  await assert.rejects(requestNextMockSlot(input), /自动领取已停止/);
  globalThis.fetch = async () => Response.json({ error: "权限已撤销" }, { status: 403 });
  await assert.rejects(requestNextMockSlot(input), /权限已撤销/);
});
test("full page draft is projected to the two allowed identity fields", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let sent: unknown;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ nextTask: { slotId: 7, nextAttemptAt: null, asOf } });
  };
  const draft = {
    ...input,
    policies: [{ zh: 1, en: 2 }],
    preview: { zh: { body: "PRIVATE" } },
    current: true,
  };
  await requestNextMockSlot(draft);
  assert.deepEqual(sent, { action: "read-next-mock-slot-local", input });
});
