import assert from "node:assert/strict";
import { test } from "node:test";
import { inquiryCaseID, inquiryCaseTitle } from "../src/lib/intake-case.ts";
test("service case links accept only a single safe positive integer", () => {
  assert.equal(inquiryCaseID("27"), 27);
  assert.equal(inquiryCaseID(27), 27);
  for (const value of [
    undefined,
    null,
    true,
    false,
    "",
    "0",
    "-2",
    "1.5",
    "1e2",
    " 2",
    "02",
    ["2"],
    "9007199254740992",
    {},
    NaN,
  ])
    assert.equal(inquiryCaseID(value), undefined, String(value));
});
test("default case title uses saved reference and name without broken Unicode", () => {
  assert.equal(inquiryCaseTitle("HC-Q-DEMO", "虚构客户"), "HC-Q-DEMO · 虚构客户");
  const title = inquiryCaseTitle("a".repeat(197), "😀😀");
  assert.ok(title.length <= 200);
  assert.ok(!/[\uD800-\uDBFF]$/.test(title));
});
