import test from "node:test";
import assert from "node:assert/strict";
import { callLimits, canAcceptCall, publicCall } from "../src/lib/calls.ts";
test("limits fail closed and enforce upper bounds", () => {
  assert.equal(callLimits({}).configured, false);
  assert.equal(
    callLimits({
      SUPPORT_CALL_MAX_SECONDS: "99999",
      SUPPORT_CALL_CONCURRENCY: "2",
      SUPPORT_CALL_DAILY_SECONDS: "4000",
    }).configured,
    false,
  );
});
test("presence must be fresh, available, language matched and under capacity", () => {
  const p = {
    state: "available",
    heartbeatAt: new Date().toISOString(),
    languages: ["en"],
    capacity: 1,
  };
  assert.equal(canAcceptCall(p, "en", 0), true);
  assert.equal(canAcceptCall(p, "en", 1), false);
  assert.equal(canAcceptCall({ ...p, heartbeatAt: "2000-01-01" }, "en", 0), false);
  assert.equal(canAcceptCall(p, "zh", 0), false);
});
test("public call projection never leaks credentials or owners", () => {
  assert.deepEqual(
    publicCall({
      id: 1,
      state: "queued",
      kind: "human",
      conversation: 4,
      secret: "x",
      gatewayToken: "secret",
    }),
    {
      id: 1,
      state: "queued",
      kind: "human",
      conversation: 4,
      expiresAt: undefined,
      staffJoined: false,
    },
  );
});

test("validated cost limits reserve full duration at bounded rate", () => {
  const limits = callLimits({
    SUPPORT_CALL_MAX_SECONDS: "90",
    SUPPORT_CALL_CONCURRENCY: "2",
    SUPPORT_CALL_DAILY_SECONDS: "4000",
    SUPPORT_CALL_MAX_CENTS_PER_MINUTE: "10",
    SUPPORT_CALL_DAILY_CENTS: "100",
  });
  assert.equal(limits.configured, true);
  assert.equal(limits.cents, 15);
});
