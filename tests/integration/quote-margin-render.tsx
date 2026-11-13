import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteMarginAmounts } from "../../src/components/business/QuoteMargin";

function render(subtotalMinor: number, costMinor: number | null, missingCost = "待补成本") {
  return renderToStaticMarkup(
    <QuoteMarginAmounts
      amounts={{
        subtotalMinor,
        costMinor,
        marginMinor: costMinor === null ? null : subtotalMinor - costMinor,
      }}
      currency="CNY"
      costLabel="本项成本合计"
      missingCost={missingCost}
    />,
  );
}

assert.match(render(20000, 22000), /毛利：-20\.00 CNY · 毛利率：-10%/);
assert.match(render(0, 5000), /毛利：-50\.00 CNY · 毛利率：—/);
assert.match(render(20000, 0), /本项成本合计：0\.00 CNY · 毛利：200\.00 CNY · 毛利率：100%/);
assert.match(render(20000, null), /本项成本合计：待补成本 · 毛利：— · 毛利率：—/);
assert.match(render(20000, null, "尚未分摊"), /本项成本合计：尚未分摊 · 毛利：—/);
console.log("PASS quote margin rendering for negative, zero, unknown and unallocated amounts");
