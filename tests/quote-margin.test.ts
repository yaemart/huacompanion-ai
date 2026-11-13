import assert from "node:assert/strict";
import test from "node:test";
import { quoteMargin } from "../src/server/business/quote-margin.ts";

const lines = [
  { label: "虚构口译", lineId: "a", unitMinor: 10000, quantity: 2 },
  { label: "虚构口译", lineId: "b", unitMinor: 0, quantity: 1 },
];

test("new quote uses line IDs, counts each cost once and keeps a negative margin", () => {
  assert.deepEqual(
    quoteMargin(lines, { lineFormat: 2, totalMinor: 20000, internalCostMinor: 9999 }, [
      { lineId: "b", costMinor: 5000 },
      { lineId: "a", costMinor: 17000 },
      { lineId: "unrelated", costMinor: 7000 },
    ]),
    {
      lines: [
        { subtotalMinor: 20000, costMinor: 17000, marginMinor: 3000 },
        { subtotalMinor: 0, costMinor: 5000, marginMinor: -5000 },
      ],
      total: { subtotalMinor: 20000, costMinor: 22000, marginMinor: -2000 },
    },
  );
});

test("zero cost is known, unknown cost leaves the entire quote incomplete", () => {
  const view = quoteMargin(lines, { lineFormat: 2, totalMinor: 20000 }, [
    { lineId: "a", costMinor: 0 },
  ]);
  assert.deepEqual(view.lines[0], { subtotalMinor: 20000, costMinor: 0, marginMinor: 20000 });
  assert.deepEqual(view.lines[1], { subtotalMinor: 0, costMinor: null, marginMinor: null });
  assert.deepEqual(view.total, { subtotalMinor: 20000, costMinor: null, marginMinor: null });
});

test("legacy cost is used only for the whole quote, including zero when recorded", () => {
  const quote = { totalMinor: 20000, internalCostMinor: 0 };
  const view = quoteMargin(lines, quote, [{ lineId: "a", costMinor: 7000 }]);
  assert.ok(
    view.lines.every(({ costMinor, marginMinor }) => costMinor === null && marginMinor === null),
  );
  assert.deepEqual(view.total, { subtotalMinor: 20000, costMinor: 0, marginMinor: 20000 });
  assert.equal(quoteMargin(lines, { totalMinor: 20000 }, []).total.marginMinor, null);
});
