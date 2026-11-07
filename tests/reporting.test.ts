import test from "node:test";
import assert from "node:assert/strict";
import { csvDocument, mondayChina, parseFilters, summarize } from "../src/lib/reporting.ts";

test("CSV has BOM, RFC quoting and protects spreadsheet formulas including whitespace", () => {
  const csv = csvDocument(["值"], [["  =1+1"], ["\t@SUM(A1)"], ["-2"], ['a,"b"\nc']]);
  assert.equal(csv, '\uFEFF"值"\r\n"\'  =1+1"\r\n"\'\t@SUM(A1)"\r\n"\'-2"\r\n"a,""b""\nc"\r\n');
});
test("report filters reject owner/where injection and invalid dates/status/category", () => {
  assert.throws(() => parseFilters({ owner: 1 }));
  assert.throws(() => parseFilters({ where: {} }));
  assert.throws(() => parseFilters({ from: "2026-02-30" }));
  assert.throws(() => parseFilters({ from: "2026-11-02", to: "2026-11-01" }));
  assert.throws(() => parseFilters({ status: "bad" }));
  assert.throws(() => parseFilters({ category: "private" }));
  assert.deepEqual(parseFilters({ from: "2026-11-01", status: "new", category: "business" }), {
    from: "2026-11-01",
    status: "new",
    category: "business",
  });
});
test("Monday weekly buckets use China UTC+8 across the Sunday UTC boundary", () => {
  assert.equal(mondayChina("2026-11-01T15:59:59Z"), "2026-10-26");
  assert.equal(mondayChina("2026-11-01T16:00:00Z"), "2026-11-02");
});
test("aggregate deduplicates cumulative funnel and measures only actual responses", () => {
  const rows = [
    {
      id: 1,
      createdAt: "2026-11-01T00:00:00Z",
      categories: ["business"],
      status: "won",
      source: "manual",
    },
    {
      id: 2,
      createdAt: "2026-11-01T00:00:00Z",
      categories: ["business", "arrival"],
      status: "new",
      source: null,
    },
    {
      id: 3,
      createdAt: "2026-11-01T00:00:00Z",
      categories: [],
      status: "closed",
      source: "website",
    },
  ];
  const result = summarize(
    rows,
    [{ status: "applied" }],
    [
      { inquiry: 1, sentAt: "2026-11-01T00:10:00Z", confirmedAt: "2026-11-01T00:12:00Z" },
      { inquiry: 1, sentAt: "2026-11-01T00:20:00Z" },
      { inquiry: 2, sentAt: "2026-11-01T00:30:00Z" },
    ],
    new Map([[2, ["2026-10-31T00:00:00Z", "2026-11-01T00:20:00Z"]]]),
  );
  assert.deepEqual(result.funnel, { inquiries: 3, quoted: 2, won: 1 });
  assert.deepEqual(result.firstResponse, { medianMinutes: 15, measuredCount: 2, total: 3 });
  assert.equal(result.categories.business, 2);
  assert.equal(result.sources["未记录"], 1);
  assert.equal(JSON.stringify(result).includes("createdAt"), false);
});
