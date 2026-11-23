import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCampaignReviewDetails } from "../src/lib/subscription-campaign-review-client.ts";

const draft = { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 1 };
const row = {
  slotId: 7,
  attemptedAt: ["2026-11-23T00:00:00Z"],
  lastOutcome: "unknown",
  reason: "unknown",
  events: [{ action: "outcome-mock-attempt", at: "2026-11-23T00:00:01Z" }],
  hasOlderEvents: false,
};
const report = {
  snapshot: { revision: 1, current: true },
  asOf: "2026-11-23T00:01:00Z",
  page: 1,
  total: 1,
  rows: [row],
};
test("review pagination sends only the selected campaign, version and page", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/subscriptions/campaigns");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      action: "read-mock-review-local",
      input: { ...draft, page: 1 },
    });
    return Response.json({ reviewDetails: report });
  };
  assert.deepEqual(
    await loadCampaignReviewDetails({ ...draft, token: "not-sent" } as typeof draft, 1),
    report,
  );
});
for (const [name, patch] of [
  ["wrong page cannot replace the displayed page", { page: 2 }],
  ["inconsistent total cannot silently omit review tasks", { total: 2 }],
  ["missing snapshot cannot carry task details", { snapshot: null }],
  ["unknown cause is not rendered as a known cause", { rows: [{ ...row, reason: "toString" }] }],
  ["sensitive raw audit fields are rejected", { rows: [{ ...row, token: "private" }] }],
  ["invalid attempt time is rejected", { rows: [{ ...row, attemptedAt: ["bad"] }] }],
  ["unknown outcome is rejected", { rows: [{ ...row, lastOutcome: "delivered" }] }],
  [
    "unsafe audit action is rejected",
    { rows: [{ ...row, events: [{ action: "PRIVATE", at: report.asOf }] }] },
  ],
  [
    "oversized audit history is rejected",
    { rows: [{ ...row, events: Array.from({ length: 21 }, () => row.events[0]) }] },
  ],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => Response.json({ reviewDetails: { ...report, ...patch } });
    await assert.rejects(loadCampaignReviewDetails(draft, 1), {
      message: "明细未更新，请稍后重试。",
    });
  });
}
for (const [name, respond] of [
  ["invalid JSON keeps a readable fallback", () => new Response("bad", { status: 503 })],
  [
    "network failure does not expose browser details",
    () => {
      throw Error("INTERNAL");
    },
  ],
  [
    "server permission guidance is preserved",
    () => Response.json({ error: "请联系管理员重新授权。" }, { status: 403 }),
  ],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => respond();
    await assert.rejects(loadCampaignReviewDetails(draft, 1), {
      message: name.startsWith("server") ? "请联系管理员重新授权。" : "明细未更新，请稍后重试。",
    });
  });
}
