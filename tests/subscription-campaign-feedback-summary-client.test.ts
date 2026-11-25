import assert from "node:assert/strict";
import { test } from "node:test";
const api = await import("../src/lib/subscription-campaign-feedback-summary-client.ts").catch(
  () => null,
);
const input = { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 2 };
const summary = {
  snapshot: { revision: 1, current: false },
  total: 2,
  counts: { delivered: 1, hardBounce: 1, complaint: 1, providerSuppressed: 1, suppressed: 2 },
  asOf: "2026-11-26T00:00:00.000Z",
};
test("feedback summary loader exists", () => assert.ok(api?.loadCampaignFeedbackSummary));
test("summary refresh sends only current scope and permits overlapping receipt categories", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/subscriptions/campaigns");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      action: "read-feedback-summary-local",
      input,
    });
    return Response.json({ feedbackSummary: summary });
  };
  assert.deepEqual(
    await api!.loadCampaignFeedbackSummary({ ...input, email: "private" } as typeof input),
    summary,
  );
});
for (const [label, response] of [
  ["invalid JSON", () => new Response("not-json")],
  ["missing counts", () => Response.json({ feedbackSummary: { ...summary, counts: {} } })],
  ["negative count", () => Response.json({ feedbackSummary: { ...summary, total: -1 } })],
  ["count exceeds audience", () => Response.json({ feedbackSummary: { ...summary, total: 0 } })],
  ["invalid clock", () => Response.json({ feedbackSummary: { ...summary, asOf: "invalid" } })],
  [
    "wrong snapshot",
    () =>
      Response.json({ feedbackSummary: { ...summary, snapshot: { revision: 2, current: false } } }),
  ],
  [
    "no snapshot with records",
    () => Response.json({ feedbackSummary: { ...summary, snapshot: null } }),
  ],
  [
    "network error",
    () => {
      throw TypeError("internal host");
    },
  ],
] as const)
  test("rejects " + label + " so old summary is retained", async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => response();
    await assert.rejects(api!.loadCampaignFeedbackSummary(input), {
      message: "回执汇总未更新，请稍后重试。",
    });
  });
test("summary preserves permission recovery guidance", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({ error: "请联系管理员重新授权。" }, { status: 403 });
  await assert.rejects(api!.loadCampaignFeedbackSummary(input), {
    message: "请联系管理员重新授权。",
  });
});
