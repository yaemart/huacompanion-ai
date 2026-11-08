import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicNavigation,
  isPublishedDestination,
  publishedGuideSections,
} from "../src/lib/public-navigation.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
const body = (
  kind: ContentBody["kind"],
  slug: string,
  locale: ContentBody["locale"] = "en",
  category?: number,
): ContentBody => ({
  kind,
  slug,
  locale,
  category,
  contentKey: `${locale}-${kind}-${slug}`,
  title: "Public fixture",
  blocks: [],
  sources: [],
});
test("menus use each language's published content and never infer an empty directory", () => {
  const data = buildPublicNavigation(
    [
      body("service", "transfer"),
      body("guide", "visa", "zh"),
      body("page", "about"),
      body("service-project", "factory"),
    ],
    "https://hua.example",
  );
  assert.equal(isPublishedDestination("/en/services", data), true);
  assert.equal(isPublishedDestination("/zh/services", data), false);
  assert.equal(isPublishedDestination("/en/guides", data), false);
  assert.equal(isPublishedDestination("/zh/guides", data), true);
  assert.equal(isPublishedDestination("/en/about", data), true);
  for (const section of ["providers", "institutions", "life", "partners", "exhibitions", "contact"])
    assert.equal(isPublishedDestination(`/en/${section}`, data), false);
  assert.equal(isPublishedDestination("/en/request", data), true);
  assert.equal(isPublishedDestination("/en/privacy", data), true);
  assert.equal(isPublishedDestination("/en", data), true);
});
test("internal service links require a public target including absolute URLs, query and fragments", () => {
  const data = buildPublicNavigation(
    [body("service", "transfer"), body("service-project", "factory")],
    "https://hua.example",
  );
  assert.equal(isPublishedDestination("/en/services/transfer?source=guide#ask", data), true);
  assert.equal(
    isPublishedDestination("https://hua.example/en/services/missing?x=1#ask", data),
    false,
  );
  assert.equal(isPublishedDestination("//hua.example/en/services/missing", data), false);
  assert.equal(isPublishedDestination("/en/services/%74ransfer/", data), true);
  assert.equal(isPublishedDestination("/en/services/transfer/extra", data), false);
  assert.equal(isPublishedDestination("https://external.example/en/services/missing", data), true);
  assert.equal(isPublishedDestination("/en/services/projects", data), true);
  assert.equal(isPublishedDestination("/en/services/projects/factory", data), true);
  assert.equal(isPublishedDestination("/en/services/projects/missing", data), false);
});
test("knowledge sections count guides in this language only, including the fallback category", () => {
  const rows = publishedGuideSections(
    [
      body("guide", "one", "en", 2),
      body("guide", "two", "zh", 3),
      body("service", "three", "en", 4),
      body("guide", "four"),
    ],
    "en",
  );
  assert.deepEqual(
    rows.map((r) => [r.id, r.count]),
    [
      [2, 1],
      [8, 1],
    ],
  );
  assert.deepEqual(publishedGuideSections([], "en"), []);
});
