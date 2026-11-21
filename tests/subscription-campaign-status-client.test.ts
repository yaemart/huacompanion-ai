import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCampaignTaskStatus } from "../src/lib/subscription-campaign-status-client.ts";

const input = { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 1 };
const status = {
  snapshot: null,
  total: 0,
  attempts: 0,
  nextAttemptAt: null,
  asOf: "2026-11-22T01:00:00.000Z",
  counts: {
    unreserved: 0,
    ready: 0,
    leased: 0,
    attempting: 0,
    retryWaiting: 0,
    retryReady: 0,
    review: 0,
    failed: 0,
    completed: 0,
    cancelled: 0,
  },
};
test("status refresh sends only current campaign/version and accepts a valid summary", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/subscriptions/campaigns");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { action: "read-mock-status-local", input });
    return Response.json({ taskStatus: status });
  };
  assert.deepEqual(await loadCampaignTaskStatus({ ...input, owner: 99 } as typeof input), status);
});
for (const [name, response] of [
  [
    "invalid JSON never becomes an English parser error",
    () => new Response("not-json", { status: 503 }),
  ],
  [
    "a malformed success never replaces the existing summary",
    () => Response.json({ taskStatus: { asOf: status.asOf, counts: {} } }),
  ],
  [
    "inconsistent totals are rejected",
    () => Response.json({ taskStatus: { ...status, total: 1 } }),
  ],
  [
    "network errors do not expose browser implementation details",
    () => {
      throw TypeError("Failed to fetch INTERNAL");
    },
  ],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => response();
    await assert.rejects(loadCampaignTaskStatus(input), { message: "统计未更新，请稍后重试。" });
  });
}
test("status refresh preserves the server's permission recovery guidance", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({ error: "请联系管理员重新授权。" }, { status: 403 });
  await assert.rejects(loadCampaignTaskStatus(input), { message: "请联系管理员重新授权。" });
});
