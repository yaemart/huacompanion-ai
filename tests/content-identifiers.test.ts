import test from "node:test";
import assert from "node:assert/strict";
import { contentSlug, numberedContentSlug, fixedPageKey } from "../src/lib/content-identifiers.ts";

test("slugs normalize accents and punctuation without inventing words for Chinese titles", () => {
  assert.equal(contentSlug("  Café — Shanghai 2027!  ", "guide-a1b2c3d4"), "cafe-shanghai-2027");
  assert.equal(contentSlug("2027 上海指南", "guide-a1b2c3d4"), "guide-a1b2c3d4");
  assert.equal(contentSlug("访客指南", "guide-a1b2c3d4"), "guide-a1b2c3d4");
  assert.equal(contentSlug("ＡＢＣ / １２", "guide-a1b2c3d4"), "abc-12");
});

test("suffixes fit the 100 character limit and do not double the separator", () => {
  const slug = contentSlug("A".repeat(98) + " - long title", "guide-a1b2c3d4");
  assert.equal(slug, "a".repeat(98) + "-l");
  const suffix = numberedContentSlug("a".repeat(97) + "-bc", 20);
  assert.equal(suffix, "a".repeat(97) + "-20");
  assert.equal(suffix.length, 100);
});

test("fixed pages reuse a legacy group only when unambiguous", () => {
  assert.equal(fixedPageKey("privacy", []), "page-privacy");
  assert.equal(fixedPageKey("privacy", ["legacy-privacy", "legacy-privacy"]), "legacy-privacy");
  assert.equal(fixedPageKey("privacy", ["legacy-privacy", "page-privacy"]), "page-privacy");
  assert.equal(fixedPageKey("privacy", ["old-privacy", "legacy-privacy"]), null);
});
