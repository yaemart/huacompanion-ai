import test from "node:test";
import assert from "node:assert/strict";
import { demoEntries } from "../scripts/lib/demo-fixtures.ts";
import { validateContent } from "../src/lib/content-model.ts";

test("demo material includes paired published pages, services, guides and exhibitions", () => {
  const entries = demoEntries("2026-11-08");
  for (const entry of entries) {
    validateContent(entry.body);
    assert.match(entry.body.title, /演示|DEMO/);
  }
  for (const locale of ["zh", "en"]) {
    const visible = entries.filter((e) => e.publish && e.body.locale === locale);
    assert.equal(visible.filter((e) => e.body.kind === "page").length, 5);
    assert.equal(visible.filter((e) => e.body.kind === "service").length, 3);
    assert.equal(visible.filter((e) => e.body.kind === "guide").length, 5);
    assert.equal(visible.filter((e) => e.body.kind === "exhibition").length, 3);
    for (const slug of ["about", "contact", "privacy", "terms"]) {
      assert.match(
        JSON.stringify(visible.find((e) => e.body.slug === slug)?.body),
        /非真实公司信息|not real company information/,
      );
    }
    assert.ok(
      entries.some((e) => e.body.locale === locale && e.body.kind === "guide" && !e.publish),
    );
  }
});
test("general demo seeding never recreates legacy language policy records", () => {
  assert.ok(demoEntries("2026-11-08").every((e) => e.body.kind !== "immigration-policy"));
});
