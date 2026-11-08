import { test } from "node:test";
import assert from "node:assert/strict";
import { exhibitionMonths, emptyExhibition } from "../src/lib/exhibitions.ts";
const item = (startDate: string, endDate: string) => ({
  kind: "exhibition",
  exhibition: { ...emptyExhibition(), startDate, endDate },
});
test("month choices cover overlap, cross-year and duplicates in calendar order", () => {
  assert.deepEqual(
    exhibitionMonths([item("2026-12-29", "2027-02-02"), item("2027-01-01", "2027-01-03")]),
    ["2026-12", "2027-01", "2027-02"],
  );
});
test("undated, invalid dates and non-exhibitions do not invent month options", () => {
  assert.deepEqual(
    exhibitionMonths([
      item("", ""),
      item("bad", "2027-02-03"),
      item("2027-04-03", "2027-04-01"),
      { ...item("2027-01-01", "2027-01-02"), kind: "guide" },
    ]),
    [],
  );
  assert.deepEqual(exhibitionMonths([], "2025-03"), ["2025-03"]);
  assert.deepEqual(exhibitionMonths([], "2025-13"), []);
});
