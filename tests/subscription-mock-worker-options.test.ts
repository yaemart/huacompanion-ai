import assert from "node:assert/strict";
import { test } from "node:test";
const api = await import("../src/lib/subscription-mock-worker-options.ts").catch(() => null);
const campaign = "00000000-0000-4000-8000-000000000001";
const args = ["--staff", "7", "--campaign", campaign, "--revision", "2"];
test("worker command requires explicit owner and version and defaults to one fixed simulated result", () => {
  assert.ok(api?.parseMockWorkerArgs, "worker argument validation must exist");
  assert.deepEqual(api.parseMockWorkerArgs(args), {
    staffId: 7,
    campaignKey: campaign,
    revision: 2,
    outcome: "accepted",
    once: false,
  });
});
test("worker accepts an explicit local rate-limit outcome and a bounded integer wait", () => {
  assert.ok(api);
  assert.deepEqual(
    api.parseMockWorkerArgs([
      ...args,
      "--outcome",
      "rate-limited",
      "--retry-after-ms",
      "120000",
      "--once",
    ]),
    {
      staffId: 7,
      campaignKey: campaign,
      revision: 2,
      outcome: "rate-limited",
      retryAfterMs: 120000,
      once: true,
    },
  );
});
test("worker rejects ambiguous scope, unknown options, duplicate flags and malformed values", () => {
  assert.ok(api);
  for (const value of [
    [],
    args.slice(0, -1),
    [...args, "--once", "--once"],
    [...args, "--staff", "8"],
    [...args, "--all"],
    [...args, "--outcome", "send-real"],
    [...args, "--retry-after-ms", "30000"],
    ["--staff", "0", ...args.slice(2)],
    ["--staff", "7e0", ...args.slice(2)],
    [...args.slice(0, 3), "invalid", ...args.slice(4)],
  ])
    assert.throws(() => api.parseMockWorkerArgs(value));
});
test("worker refuses every non-local environment and never treats missing mode as local", () => {
  assert.ok(api);
  for (const APP_ENV of [undefined, "trial", "production", "ci", "LOCAL"])
    assert.throws(() => api.requireLocalMockWorker({ APP_ENV }));
  assert.doesNotThrow(() => api.requireLocalMockWorker({ APP_ENV: "local" }));
});
test("worker freezes a validated copy so a caller cannot change scope or outcome mid-run", () => {
  assert.ok(api);
  const value = { staffId: 7, campaignKey: campaign, revision: 2, outcome: "unknown" };
  const options = api.mockWorkerOptions(value);
  value.outcome = "accepted";
  assert.equal(options.outcome, "unknown");
  assert.equal(Object.isFrozen(options), true);
  for (const input of [
    true,
    [],
    { ...value, once: "false" },
    { ...value, outcome: null },
    { ...value, revision: 0 },
    { ...value, token: "forbidden" },
    { ...value, outcome: "rate-limited", retryAfterMs: -1 },
    { ...value, outcome: "rate-limited", retryAfterMs: Infinity },
  ])
    assert.throws(() => api.mockWorkerOptions(input));
});
