import assert from "node:assert/strict";
import { test } from "node:test";
import { guideTargetLocale, prefillGuideTranslation } from "../src/lib/guide-translation.ts";

test("guides only pair Chinese and English", () => {
  assert.equal(guideTargetLocale("zh"), "en");
  assert.equal(guideTargetLocale("en"), "zh");
  assert.equal(guideTargetLocale("es"), null);
});

test("new guide translation prefills only the shared fields", () => {
  const sources = [
    { id: "official", title: "核实资料", url: "https://example.org/", checkedAt: "2026-11-11" },
  ];
  const source = {
    contentKey: "guide-test",
    body: {
      title: "原文标题",
      summary: "原文摘要",
      blocks: [{ type: "paragraph", text: "原文正文" }],
      slug: "guide-test",
      category: 3,
      order: 12,
      seoTitle: "原文 SEO",
      seoImage: 12,
      sources,
      qualityReview: { checkedAt: "2026-11-11" },
    },
  };
  const form = prefillGuideTranslation(source, "en");
  assert.deepEqual(form, {
    kind: "guide",
    locale: "en",
    contentKey: "guide-test",
    slug: "",
    title: "",
    blocks: [],
    category: 3,
    order: 12,
    sources,
  });
  assert.notEqual(form.sources, sources);
  assert.notEqual(form.sources[0], sources[0]);
});

test("legacy guides without a chosen section prefill the resolved section", () => {
  const legacy = { contentKey: "legacy-guide", body: { kind: "guide", category: 0, sources: [] } };
  assert.equal(prefillGuideTranslation(legacy, "en").category, 8);
});
