import assert from "node:assert/strict";
import test from "node:test";
import { locales } from "../src/lib/locales.ts";
import { publicCopy, publicText, resultText } from "../src/lib/public-copy.ts";
import { contentSections } from "../src/lib/content-sections.ts";

test("every public interface message and knowledge section covers all seven locales", () => {
  for (const [key, messages] of Object.entries(publicCopy)) {
    assert.deepEqual(Object.keys(messages).sort(), [...locales].sort(), key);
    for (const locale of locales) assert.ok(messages[locale].trim(), `${key}: ${locale}`);
  }
  for (const section of contentSections) {
    for (const locale of locales) {
      assert.ok(section[locale].trim());
      assert.ok(section.description[locale].trim());
    }
  }
});

test("new locales have translated empty states and result counts", () => {
  for (const locale of ["es", "fr", "de", "it", "ar"] as const) {
    for (const key of [
      "Content is being prepared. Please check back later.",
      "Content in this section is being prepared and reviewed.",
      "No published matches. Clear the filters or send Hua your requirements.",
    ] as const)
      assert.notEqual(publicText(locale, key), publicText("en", key));
    assert.ok(resultText(locale, 12).includes("12"));
    assert.notEqual(resultText(locale, 12), resultText("en", 12));
  }
});
