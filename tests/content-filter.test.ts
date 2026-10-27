import { test } from "node:test";
import assert from "node:assert/strict";
import { filterGuides } from "../src/lib/content-filter.ts";
test("published guide filtering preserves category selection", () => {
  const items = [{ category: 1 }, { category: 2 }, { category: 1 }];
  assert.equal(filterGuides(items, 0).length, 3);
  assert.equal(filterGuides(items, 1).length, 2);
  assert.equal(filterGuides(items, 6).length, 0);
});
