import { test } from "node:test";
import assert from "node:assert/strict";
import { providerReviewInput } from "../src/lib/provider-review.ts";
const valid = {
  id: "12",
  status: "verified",
  reason: "  已核对虚构证明  ",
  key: "12345678-1234-4234-8234-123456789abc",
  updatedAt: "2026-11-10T00:00:00.000Z",
};
test("审核输入只接受明确状态、有效编号、原因及重试键", () => {
  assert.deepEqual(providerReviewInput(valid), { ...valid, id: 12, reason: "已核对虚构证明" });
  for (const change of [
    { id: true },
    { id: "1e2" },
    { id: 0 },
    { status: "applied" },
    { status: "constructor" },
    { reason: "  " },
    { reason: "a".repeat(2001) },
    { key: "" },
    { updatedAt: "bad" },
  ])
    assert.throws(() => providerReviewInput({ ...valid, ...change }));
  for (const value of [null, [], false]) assert.throws(() => providerReviewInput(value));
});
