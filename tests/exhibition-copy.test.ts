import test from "node:test";
import assert from "node:assert/strict";
import { exhibitionCopy, exhibitionIndustries, exhibitionIndustryLabel, exhibitionText } from "../src/lib/exhibition-copy.ts";
import { locales } from "../src/lib/locales.ts";

test("exhibition copy explicitly covers every locale and every key", () => {
  assert.deepEqual(Object.keys(exhibitionCopy).sort(), [...locales].sort());
  for (const locale of locales) {
    assert.deepEqual(Object.keys(exhibitionCopy[locale]).sort(), Object.keys(exhibitionCopy.en).sort());
    for (const [key, value] of Object.entries(exhibitionCopy[locale])) assert.ok(value.trim().length, `${locale}.${key}`);
    for (const industry of exhibitionIndustries) assert.ok(exhibitionIndustryLabel(industry, locale).length);
    for (const status of ["pending", "announced", "postponed", "cancelled", "ended"] as const) assert.ok(exhibitionText(locale, status).length);
  }
});
test("unknown industries use a localized fallback", () => {
  for (const locale of locales) assert.equal(exhibitionIndustryLabel("unknown", locale), exhibitionCopy[locale].other);
});
