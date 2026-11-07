import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdmin, isOperator, inquiryScope } from "../src/cms/access.ts";
test("anonymous and editors cannot access customer records", () => {
  assert.equal(inquiryScope(null), false);
  assert.equal(inquiryScope({ id: 3, role: "editor" }), false);
});
test("operators are scoped to their assignment and cannot administer users", () => {
  const u = { id: 2, role: "operations", team: 4 };
  assert.deepEqual(inquiryScope(u), { and: [{ owner: { equals: 2 } }, { team: { equals: 4 } }] });
  assert.equal(isAdmin(u), false);
  assert.equal(isOperator(u), true);
});
test("administrators can access all inquiries", () => {
  assert.equal(isAdmin({ id: 1, role: "admin" }), true);
  assert.equal(inquiryScope({ id: 1, role: "admin" }), true);
});

test("disabled users and identities from other collections never gain authority", () => {
  for (const u of [
    { id: 1, role: "admin", active: false },
    { id: 1, role: "admin", collection: "customers" },
  ]) {
    assert.equal(isAdmin(u), false);
    assert.equal(inquiryScope(u), false);
    assert.equal(contentScope(u), false);
  }
});
test("manager scope requires a team, combined roles union their assignments", () => {
  assert.equal(inquiryScope({ id: 2, role: "manager" }), false);
  assert.deepEqual(inquiryScope({ id: 2, role: "manager", team: { id: 4 } }), {
    team: { equals: 4 },
  });
  assert.deepEqual(
    inquiryScope({ id: 2, role: "operations", additionalRoles: ["manager"], team: 4 }),
    { or: [{ team: { equals: 4 } }, { and: [{ owner: { equals: 2 } }, { team: { equals: 4 } }] }] },
  );
  assert.equal(providerScope({ id: 2, role: "operations" }), false);
  assert.deepEqual(providerScope({ id: 2, role: "operations", team: 4 }), {
    and: [{ owner: { equals: 2 } }, { team: { equals: 4 } }],
  });
});
test("editorial boards default deny and reviewers gain only their assigned boards", () => {
  const editor = { id: 2, role: "editor" };
  assert.equal(contentScope(editor), false);
  assert.equal(canReviewContent(editor), false);
  const reviewer = { id: 3, role: "reviewer", contentKinds: ["guide", "invented"] };
  assert.equal(canManageContent(reviewer), true);
  assert.equal(canReviewContent(reviewer), true);
  assert.equal(canAccessContentKind(reviewer, "guide"), true);
  assert.equal(canAccessContentKind(reviewer, "page"), false);
  assert.deepEqual(contentScope(reviewer), { kind: { in: ["guide"] } });
  assert.equal(contentScope({ id: 1, role: "admin" }), true);
});

import {
  contentScope,
  providerScope,
  canManageContent,
  canReviewContent,
  canAccessContentKind,
} from "../src/cms/access.ts";
import {
  authorityChanged,
  validOwner,
  guardBusinessAssignment,
  guardStaffChange,
} from "../src/cms/staff-guards.ts";
test("owner eligibility enforces active operations role and a matching non-null team", () => {
  assert.equal(validOwner({ id: 2, role: "operations", team: 1 }, 1), true);
  assert.equal(
    validOwner({ id: 2, role: "editor", additionalRoles: ["operations"], team: { id: 1 } }, 1),
    true,
  );
  assert.equal(validOwner({ id: 2, role: "operations", team: 2 }, 1), false);
  assert.equal(validOwner({ id: 2, role: "operations", active: false, team: 1 }, 1), false);
  assert.equal(validOwner({ id: 2, role: "operations" }, null), false);
});
test("authority change detector excludes ordinary profile edits", () => {
  assert.equal(authorityChanged({ name: "New" }, { role: "admin" }), false);
  assert.equal(authorityChanged({ role: "editor" }, { role: "admin" }), true);
  assert.equal(authorityChanged({ contentKinds: [] }, { contentKinds: ["guide"] }), true);
});
test("assignment guard refuses cross-team transfer and ordinary operator assignment", async () => {
  const check = guardBusinessAssignment as (args: any) => Promise<any>;
  const payload = { findByID: async () => ({ id: 7, role: "operations", team: 1 }) };
  await assert.rejects(() =>
    check({
      req: { user: { id: 2, role: "manager", team: 1 }, payload },
      data: { team: 2 },
      originalDoc: { team: 1 },
    }),
  );
  await assert.rejects(() =>
    check({
      req: { user: { id: 2, role: "operations", team: 1 }, payload },
      data: { owner: 7 },
      originalDoc: { team: 1 },
    }),
  );
  assert.deepEqual(
    await check({
      req: { user: { id: 2, role: "manager", team: 1 }, payload },
      data: { owner: 7 },
      originalDoc: { team: 1 },
    }),
    { owner: 7 },
  );
  await assert.rejects(() =>
    check({
      req: { user: { id: 2, role: "admin" }, payload },
      data: { owner: 7, team: 2 },
      originalDoc: {},
    }),
  );
});
test("authority edits revoke sessions and cannot remove the last active administrator", async () => {
  const check = guardStaffChange as (args: any) => Promise<any>;
  const req = {
    user: { id: 1, role: "admin" },
    context: {},
    payload: { find: async () => ({ docs: [] }) },
  };
  await assert.rejects(() =>
    check({
      req,
      operation: "update",
      originalDoc: { id: 1, role: "admin" },
      data: { active: false },
    }),
  );
  assert.deepEqual(
    await check({
      req,
      operation: "update",
      originalDoc: { id: 2, role: "editor" },
      data: { active: false },
    }),
    { active: false, sessions: [] },
  );
});
