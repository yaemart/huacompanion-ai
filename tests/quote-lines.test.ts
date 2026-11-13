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

test("sent fee notices are read from the saved version and collection takes precedence", () => {
  const quote = publicQuote({
    lineFormat: 2,
    lines: [
      { ...amount, mode: "referral" },
      { ...amount, mode: "managed", collectionNotice: "历史代收原文" },
      {
        ...amount,
        mode: "managed",
        customerNotice: "不显示的通用说明",
        collectionNotice: "发出时的代收文案",
        collection: { reason: "other", note: "内部原因" },
      },
      { ...amount, mode: "referral", customerNotice: "发出时的合作文案" },
    ],
  });
  assert.deepEqual(
    quote.lines.map(({ customerNotice, collectionNotice }) => [customerNotice, collectionNotice]),
    [
      [undefined, undefined],
      [undefined, "历史代收原文"],
      [undefined, "发出时的代收文案"],
      ["发出时的合作文案", undefined],
    ],
  );
  assert.ok(!JSON.stringify(quote).includes("内部原因"));
});
