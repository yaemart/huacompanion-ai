import test from "node:test";
import assert from "node:assert/strict";
import type { PolicyNoteDraft, PolicyNoteVersion } from "../payload-types";
import {
  policyNoteDraft,
  explanationFactWarning,
  approvedSharedNote,
} from "../src/lib/policy-shared-notes.ts";
const draft = {
  id: 1,
  group: 2,
  locale: "zh",
  revision: 3,
  title: "改稿",
  slug: "draft",
  publicNotes: "未审核",
  basedOnFactVersion: 4,
  publishedNoteVersion: 5,
  needsReview: false,
  reviewState: "draft",
  createdAt: "",
  updatedAt: "",
} satisfies PolicyNoteDraft;
const version = {
  id: 5,
  group: 2,
  locale: "zh",
  revision: 1,
  title: "已审核",
  slug: "approved",
  publicNotes: "已审核说明",
  basedOnFactVersion: 4,
  sourceRevision: 2,
  approvedBy: 9,
  contributors: [8],
  overrideReason: "private",
  createdAt: "",
  updatedAt: "",
} satisfies PolicyNoteVersion;
test("note patch has strict fields, types, lengths and route syntax", () => {
  for (const value of [
    null,
    [],
    "text",
    { facts: {} },
    { needsReview: false },
    { publicNotes: 9 },
    { title: " " },
    { title: "x".repeat(201) },
    { slug: "/bad" },
    { slug: "x".repeat(101) },
    { publicNotes: "x".repeat(4001) },
  ])
    assert.throws(() => policyNoteDraft(value));
  const text = "  公开说明\n30天  ";
  assert.deepEqual(policyNoteDraft({ publicNotes: text }), { publicNotes: text });
  assert.deepEqual(policyNoteDraft({}), {});
});
test("date/day/hour warning covers Chinese and English and never changes text", () => {
  const expected = "建议将日期、停留天数或小时数放入事实字段，以免事实更新后说明不一致";
  for (const text of [
    "2027-01-01",
    "2027年1月1日",
    "30天",
    "240 小时",
    "30 days",
    "240 HOURS",
    "1 day",
  ]) {
    const before = text;
    assert.equal(explanationFactWarning(text), expected);
    assert.equal(text, before);
  }
  for (const text of ["Please check the official source.", "请核对官方来源。", "Contact 12345", ""])
    assert.equal(explanationFactWarning(text), null);
});
test("approved note uses immutable allowlist while working draft is edited or returned", () => {
  const visible = { title: "已审核", slug: "approved", publicNotes: "已审核说明" };
  for (const reviewState of ["draft", "review", "returned", "approved"] as const)
    assert.deepEqual(approvedSharedNote(2, "zh", 4, { ...draft, reviewState }, version), visible);
  assert.equal("approvedBy" in approvedSharedNote(2, "zh", 4, draft, version)!, false);
  assert.equal("contributors" in approvedSharedNote(2, "zh", 4, draft, version)!, false);
  assert.equal("overrideReason" in approvedSharedNote(2, "zh", 4, draft, version)!, false);
});
test("missing, stale, pending or cross-policy/cross-language notes fail closed", () => {
  for (const [d, v, f] of [
    [null, version, 4],
    [draft, null, 4],
    [draft, version, null],
    [draft, version, 6],
    [{ ...draft, needsReview: true }, version, 4],
    [{ ...draft, publishedNoteVersion: null }, version, 4],
    [{ ...draft, publishedNoteVersion: 7 }, version, 4],
    [{ ...draft, group: 99 }, version, 4],
    [draft, { ...version, group: 99 }, 4],
    [draft, { ...version, locale: "en" }, 4],
    [{ ...draft, locale: "en" }, version, 4],
  ] as const)
    assert.equal(approvedSharedNote(2, "zh", f, d, v), null);
});
