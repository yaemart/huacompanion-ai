import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canEditContent,
  validateContent,
  validateCandidate,
} from "../src/lib/content-model.ts";
const doc = {
  contentKey: "guide-a",
  kind: "guide",
  locale: "en",
  slug: "guide-a",
  title: "A guide",
  summary: "Summary",
  blocks: [{ type: "paragraph", text: "A paragraph" }],
  sources: [{ id: "source-1", title: "Source", url: "https://example.com" }],
};
test("only administrators and editors may manage content", () => {
  assert.equal(canEditContent({ id: 1, role: "editor" }), true);
  assert.equal(canEditContent({ id: 1, role: "admin" }), true);
  for (const role of ["operations", "agent", ""])
    assert.equal(canEditContent({ id: 1, role }), false);
  assert.equal(canEditContent(null), false);
});
test("content permits safe blocks and sources", () => {
  assert.doesNotThrow(() => validateContent(doc));
  assert.throws(() =>
    validateContent({ ...doc, blocks: [{ type: "html", text: "<script/>" }] }),
  );
  assert.throws(() =>
    validateContent({
      ...doc,
      sources: [{ id: "s", title: "bad", url: "javascript:alert(1)" }],
    }),
  );
  assert.throws(() => validateContent({ ...doc, slug: "../admin" }));
});
test("AI candidate must use provided source identifiers and safe body", () => {
  assert.doesNotThrow(() =>
    validateCandidate(
      {
        title: "Draft",
        blocks: doc.blocks,
        sourceIds: ["source-1"],
        questions: [],
      },
      ["source-1"],
    ),
  );
  assert.throws(() =>
    validateCandidate(
      {
        title: "Draft",
        blocks: doc.blocks,
        sourceIds: ["invented"],
        questions: [],
      },
      ["source-1"],
    ),
  );
  assert.throws(() =>
    validateCandidate(
      {
        title: "Draft",
        blocks: [{ type: "html", text: "hi" }],
        sourceIds: [],
        questions: [],
      },
      [],
    ),
  );
});
test("page content rejects unreachable routes and supports privacy and terms", () => {
  assert.throws(() => validateContent({ ...doc, kind: "page", slug: "team" }));
  assert.doesNotThrow(() =>
    validateContent({ ...doc, kind: "page", slug: "privacy" }),
  );
  assert.doesNotThrow(() =>
    validateContent({ ...doc, kind: "page", slug: "terms" }),
  );
});

test("content accepts all seven explicit locales and rejects unsupported language codes", () => {
  for (const locale of ["zh", "en", "es", "fr", "de", "it", "ar"])
    assert.doesNotThrow(() => validateContent({...doc, locale}));
  for (const locale of ["ja", "", "EN", null])
    assert.throws(() => validateContent({...doc, locale}));
});
