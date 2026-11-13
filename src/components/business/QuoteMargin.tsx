import type { QuoteMargin } from "../../server/business/quote-margin";

export function QuoteMarginAmounts({
  amounts,
  currency,
  costLabel,
  missingCost,
}: {
  amounts: QuoteMargin["total"];
  currency: string;
  costLabel: string;
  missingCost: string;
}) {
  const { subtotalMinor, costMinor, marginMinor } = amounts;
  const money = (minor: number) => `${(minor / 100).toFixed(2)} ${currency}`;
  const rate = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 });
  return (
    <p>
      对客小计：{money(subtotalMinor)} · {costLabel}：
      {costMinor === null ? missingCost : money(costMinor)} · 毛利：
      {marginMinor === null ? "—" : money(marginMinor)} · 毛利率：
      {marginMinor === null || subtotalMinor === 0 ? "—" : rate.format(marginMinor / subtotalMinor)}
    </p>
  );
}
