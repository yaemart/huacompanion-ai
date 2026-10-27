import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentSections,
  sectionFor,
  filterContent,
} from "../src/lib/content-sections.ts";
test("eight sections preserve existing category identifiers", () => {
  assert.equal(contentSections.length, 8);
  assert.equal(contentSections.find((s) => s.id === 2)?.key, "business");
  assert.equal(sectionFor({ kind: "service", slug: "medical" }), 3);
  assert.equal(sectionFor({ kind: "faq" }), 8);
});
test("filters combine section, language, status and search", () => {
  const rows = [
    {
      title: "Factory visit",
      locale: "en",
      reviewState: "draft",
      body: { category: 2 },
    },
    {
      title: "Airport",
      locale: "en",
      reviewState: "review",
      body: { category: 4 },
    },
  ];
  assert.equal(
    filterContent(rows, {
      section: 2,
      locale: "en",
      state: "draft",
      query: "factory",
    }).length,
    1,
  );
  assert.equal(filterContent(rows, { section: 2, locale: "zh" }).length, 0);
});
