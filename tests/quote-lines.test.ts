import assert from "node:assert/strict";
import test from "node:test";
import { publicQuote } from "../src/lib/business.ts";

const amount = { label: "虚构口译", quantity: 2, unitMinor: 31000 };

test("legacy quote projection exposes only fee name, quantity and unit price", () => {
  const row = { ...amount, lineId: "not-a-legacy-field", serviceName: "Unknown", costMinor: 98271 };
  assert.deepEqual(publicQuote({ lines: [row], internalCostMinor: 73559 }).lines, [amount]);
});

test("new quote projection exposes party names but keeps sources, costs and reasons private", () => {
  const parties = {
    lineId: "fee-id",
    mode: "referral",
    serviceName: "虚构服务商",
    contractName: "虚构服务商",
    payeeName: "虚构服务商",
  };
  const row = {
    ...amount,
    ...parties,
    providerId: 1234,
    serviceSource: "provider",
    costMinor: 97979,
    marginMinor: 8888,
    collectionReason: "private",
  };
  const result = publicQuote({ lineFormat: 2, lines: [row], lineCosts: [{ costMinor: 97979 }] });
  assert.deepEqual(result.lines, [{ ...amount, ...parties }]);
  assert.equal(Object.hasOwn(result, "lineCosts"), false);
});
