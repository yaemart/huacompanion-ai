import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePolicyCsv,
  policyCsvHeaders,
  validatePolicyCsv,
} from "../src/lib/policy-csv-import.ts";

test("CSV keeps quoted commas, line breaks and spreadsheet BOM", () => {
  assert.deepEqual(parsePolicyCsv('\uFEFF国家,说明\r\nXY,"一,二\r\n第三行 ""备注"""\r\n'), [
    { line: 1, cells: ["国家", "说明"] },
    { line: 2, cells: ["XY", '一,二\r\n第三行 "备注"'] },
  ]);
});

test("validates every row and keeps bilingual descriptions out of shared facts", () => {
  const csv = [
    policyCsvHeaders.join(","),
    "XY,240小时过境,240,小时,2026-01-01,,虚构口岸,https://example.invalid,2026-01-01,仅演示,Demo only,内部,",
    "XZ,240小时过境,10,天,2026-01-01,,虚构口岸,https://example.invalid,2026-01-01,,,,",
    "XW,互免,30,天,2026-01-01,,,https://example.invalid,2027-01-01,,,,",
  ].join("\n");
  const result = validatePolicyCsv(csv, "2026-11-14", 9, true);
  assert.equal(result.total, 3);
  assert.deepEqual(
    result.issues.map((issue) => issue.line),
    [3, 4],
  );
  assert.equal(result.rows[0].facts.verifiedBy, 9);
  assert.equal(result.rows[0].key, "xy-transit-240h");
  assert.ok(!Object.hasOwn(result.rows[0].facts, "publicNotes"));
  assert.deepEqual(
    result.rows[0].notes.map((note) => note.publicNotes),
    ["仅演示", "Demo only"],
  );
  assert.equal(validatePolicyCsv(csv, "2026-11-14", 9, false).rows.length, 0);
});

test("malformed quotation is rejected with its original line", () => {
  assert.throws(() => parsePolicyCsv('列\n"没结束'), /第 2 行/);
  assert.throws(() => parsePolicyCsv('列\n"完整"多余'), /第 2 行/);
});

test("explicit keys distinguish policies of the same country and type", () => {
  const row = "XY,other,30,days,2026-01-01,,,https://example.invalid,2026-01-01,,,,";
  const csv = [policyCsvHeaders.join(","), row + "xy-rule-a", row + "xy-rule-b", row + "Bad Key"];
  const result = validatePolicyCsv(csv.join("\n"), "2026-11-14", 9, true);
  assert.deepEqual(
    result.rows.map((policy) => policy.key),
    ["xy-rule-a", "xy-rule-b"],
  );
  assert.match(result.issues[0].message, /内容标识/);
});
