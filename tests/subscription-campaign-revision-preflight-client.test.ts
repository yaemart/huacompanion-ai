import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCampaignRevisionPreflight } from "../src/lib/subscription-campaign-revision-preflight-client.ts";

const draft = { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 2 };
const report = {
  revision: 2,
  snapshot: { revision: 1, current: false },
  asOf: "2026-11-24T00:01:00.000Z",
  total: 10,
  counts: { attempted: 6, cancelled: 1, ineligible: 0, leased: 1, candidates: 2 },
  blockers: ["confirmation-required", "active-lease"],
};
test("preflight refresh scopes to the saved draft and accepts safe aggregate counts", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/subscriptions/campaigns");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      action: "read-revision-preflight-local",
      input: draft,
    });
    return Response.json({ preflight: report });
  };
  assert.deepEqual(
    await loadCampaignRevisionPreflight({ ...draft, token: "not-sent" } as typeof draft),
    report,
  );
});
for (const [name, patch] of [
  ["wrong saved revision cannot replace the current report", { revision: 3 }],
  ["a future frozen revision is rejected", { snapshot: { revision: 3, current: false } }],
  [
    "a current snapshot must match the saved revision",
    { snapshot: { revision: 1, current: true } },
  ],
  ["a missing snapshot cannot carry tasks", { snapshot: null }],
  [
    "an empty missing snapshot still requires its blocker",
    {
      snapshot: null,
      total: 0,
      counts: { attempted: 0, cancelled: 0, ineligible: 0, leased: 0, candidates: 0 },
      blockers: [],
    },
  ],
  [
    "a current snapshot requires the not-revised blocker",
    { snapshot: { revision: 2, current: true } },
  ],
  ["leased tasks require an active-lease blocker", { blockers: ["confirmation-required"] }],
  [
    "an existing snapshot cannot be reported missing",
    { blockers: [...report.blockers, "no-snapshot"] },
  ],
  [
    "a revised snapshot cannot be labelled not-revised",
    { blockers: [...report.blockers, "not-revised"] },
  ],
  [
    "private snapshot fields are rejected",
    { snapshot: { revision: 1, current: false, email: "private" } },
  ],
  ["private top-level fields are rejected", { token: "private" }],
  ["private count fields are rejected", { counts: { ...report.counts, email: 0 } }],
  ["a missing count is rejected", { counts: { candidates: 10 } }],
  [
    "negative counts cannot suggest extra candidates",
    { counts: { ...report.counts, candidates: -1 } },
  ],
  ["fractional totals are rejected", { total: 10.5 }],
  ["inconsistent count total is rejected", { total: 11 }],
  ["a thousand-person boundary cannot be bypassed", { total: 1001 }],
  ["unknown blocker is rejected", { blockers: ["toString"] }],
  ["array blocker cannot be coerced into an allowed code", { blockers: [["paused"]] }],
  ["duplicate blockers are rejected", { blockers: ["paused", "paused"] }],
  [
    "date notes cannot leak through the report",
    { asOf: "Tue, 24 Nov 2026 00:01:00 GMT (private@example.invalid)" },
  ],
  ["missing time cannot replace a dated report", { asOf: null }],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => Response.json({ preflight: { ...report, ...patch } });
    await assert.rejects(loadCampaignRevisionPreflight(draft), {
      message: "预检未更新，请稍后重试。",
    });
  });
}
for (const [name, respond, message] of [
  [
    "network failures keep readable guidance",
    () => {
      throw Error("INTERNAL");
    },
    "预检未更新，请稍后重试。",
  ],
  [
    "invalid JSON preserves the previous report",
    () => new Response("bad", { status: 503 }),
    "预检未更新，请稍后重试。",
  ],
  ["a missing report is not a success", () => Response.json({}), "预检未更新，请稍后重试。"],
  [
    "null success is rejected",
    () => Response.json({ preflight: null }),
    "预检未更新，请稍后重试。",
  ],
  [
    "primitive success is rejected",
    () => Response.json({ preflight: "ok" }),
    "预检未更新，请稍后重试。",
  ],
  [
    "server version guidance survives",
    () => Response.json({ error: "草稿已有更新，请刷新后重新测试。" }, { status: 409 }),
    "草稿已有更新，请刷新后重新测试。",
  ],
] as const) {
  test(name, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => respond();
    await assert.rejects(loadCampaignRevisionPreflight(draft), { message });
  });
}
test("empty preflight without a snapshot remains readable", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const empty = {
    ...report,
    snapshot: null,
    total: 0,
    counts: { attempted: 0, cancelled: 0, ineligible: 0, leased: 0, candidates: 0 },
    blockers: ["no-snapshot"],
  };
  globalThis.fetch = async () => Response.json({ preflight: empty });
  assert.deepEqual(await loadCampaignRevisionPreflight(draft), empty);
});
test("attempted history may hold an active lease even with no unstarted leases", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const activeHistory = { ...report, counts: { ...report.counts, leased: 0, candidates: 3 } };
  globalThis.fetch = async () => Response.json({ preflight: activeHistory });
  assert.deepEqual(await loadCampaignRevisionPreflight(draft), activeHistory);
});
