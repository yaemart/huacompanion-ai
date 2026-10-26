import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdmin, isOperator, inquiryScope } from "../src/cms/access.ts";
test("anonymous and editors cannot access customer records", () => {
  assert.equal(inquiryScope(null), false);
  assert.equal(inquiryScope({ id: 3, role: "editor" }), false);
});
test("operators are scoped to their assignment and cannot administer users", () => {
  const u = { id: 2, role: "operations" };
  assert.deepEqual(inquiryScope(u), { owner: { equals: 2 } });
  assert.equal(isAdmin(u), false);
  assert.equal(isOperator(u), true);
});
test("administrators can access all inquiries", () => {
  assert.equal(isAdmin({ id: 1, role: "admin" }), true);
  assert.equal(inquiryScope({ id: 1, role: "admin" }), true);
});
