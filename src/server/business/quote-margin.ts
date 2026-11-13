import type { ServiceQuote } from "../../../payload-types";
import type { LineCost, QuoteLineView } from "../../lib/quote-lines";

function amounts(subtotalMinor: number, costMinor: number | null) {
  return {
    subtotalMinor,
    costMinor,
    marginMinor: costMinor === null ? null : subtotalMinor - costMinor,
  };
}

export function quoteMargin(
  lines: QuoteLineView[],
  quote: Pick<ServiceQuote, "lineFormat" | "totalMinor" | "internalCostMinor">,
  costs: LineCost[],
) {
  const modern = quote.lineFormat === 2;
  const costByLine = new Map(costs.map(({ lineId, costMinor }) => [lineId, costMinor]));
  const rows = lines.map(({ quantity, unitMinor, lineId }) =>
    amounts(quantity * unitMinor, modern && lineId ? (costByLine.get(lineId) ?? null) : null),
  );
  let totalCost = quote.internalCostMinor ?? null;
  if (modern) {
    const complete = rows.length > 0 && rows.every(({ costMinor }) => costMinor !== null);
    totalCost = complete ? rows.reduce((sum, { costMinor }) => sum + (costMinor ?? 0), 0) : null;
  }
  return { lines: rows, total: amounts(quote.totalMinor, totalCost) };
}

export type QuoteMargin = ReturnType<typeof quoteMargin>;
