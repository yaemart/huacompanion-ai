import { test } from "node:test";
import assert from "node:assert/strict";
import {
  policyCountryOptions,
  searchPolicyCountries,
  assertPolicyCountry,
  policyTestCountriesAllowed,
  autoPolicyIdentity,
} from "../src/lib/immigration-policy-entry.ts";
import { policyForm } from "../src/lib/immigration-policy-editor.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
const body: ContentBody = {
  kind: "immigration-policy",
  locale: "zh",
  contentKey: "",
  slug: "",
  title: "",
  blocks: [],
  sources: [],
};
const german = {
  ...policyForm(),
  countryCode: "DE",
  countryNameZh: "德国",
  countryNameEn: "Germany",
  policyType: "unilateral" as const,
};
test("packed ISO list has all 249 unique codes and nonempty Chinese/English names; Chinese, English and code searches work", () => {
  const options = policyCountryOptions(false);
  assert.equal(options.length, 249);
  assert.equal(new Set(options.map((o) => o.code)).size, 249);
  assert.ok(
    options.every(
      (o) =>
        /^[A-Z]{2}$/.test(o.code) &&
        o.nameEn &&
        o.nameZh &&
        o.nameEn !== o.code &&
        o.nameZh !== o.code,
    ),
  );
  for (const query of ["德", "Ger", " DE ", "ｄｅ"])
    assert.ok(
      searchPolicyCountries(options, query).some((o) => o.code === "DE"),
      query,
    );
  assert.equal(searchPolicyCountries(options, "de")[0].code, "DE");
  assert.deepEqual(searchPolicyCountries(options, "not-a-country"), []);
  assert.equal(searchPolicyCountries(options, "").length, 249);
});
test("unknown ISO codes rejected even in local mode; only four explicit fictional codes can be used for local testing", () => {
  for (const code of ["ZZ", "XX", "XK", "UK", "de", "D", "DEU", "constructor", "", 123]) {
    for (const allow of [false, true])
      assert.throws(() => assertPolicyCountry(code, allow), /国家/);
  }
  for (const code of ["DE", "US", "GB"])
    assert.doesNotThrow(() => assertPolicyCountry(code, false));
  for (const code of ["XY", "XZ", "XW", "XQ"]) {
    assert.throws(() => assertPolicyCountry(code, false), /国家/);
    assert.doesNotThrow(() => assertPolicyCountry(code, true));
    const option = policyCountryOptions(true).find((o) => o.code === code);
    assert.match(option!.nameZh, /虚构/);
    assert.match(option!.nameEn, /Fictional/);
  }
  assert.doesNotThrow(
    () => assertPolicyCountry(null, false),
    "Unknown facts can still be saved as incomplete drafts",
  );
});
test("fictional-country opt-in is server environment only, fails closed including production with local APP_ENV", () => {
  assert.equal(policyTestCountriesAllowed({ APP_ENV: "local", NODE_ENV: "development" }), true);
  assert.equal(policyTestCountriesAllowed({ APP_ENV: "local", NODE_ENV: "test" }), true);
  for (const APP_ENV of [undefined, "ci", "trial", "production"])
    assert.equal(policyTestCountriesAllowed({ APP_ENV, NODE_ENV: "development" }), false);
  assert.equal(policyTestCountriesAllowed({ APP_ENV: "local", NODE_ENV: "production" }), false);
});
test("new policy identity auto follows country/type/current language and preserves manually changed fields", () => {
  const generated = autoPolicyIdentity(body, policyForm(), german);
  assert.equal(generated.contentKey, "de-unilateral-visa-free");
  assert.equal(generated.slug, generated.contentKey);
  assert.equal(generated.title, "德国 · 单方面免签");
  const transit = { ...german, policyType: "transit-240h" as const };
  const switched = autoPolicyIdentity(generated, german, transit);
  assert.equal(switched.contentKey, "de-transit-240h");
  const manual = {
    ...generated,
    title: "手动标题",
    contentKey: "special-key",
    slug: "special-url",
  };
  assert.deepEqual(autoPolicyIdentity(manual, german, transit), manual);
  const english = autoPolicyIdentity({ ...generated, locale: "en" }, german, german, "zh");
  assert.equal(english.title, "Germany · Unilateral visa-free");
  assert.equal(english.contentKey, generated.contentKey);
  assert.equal(
    autoPolicyIdentity({ ...manual, locale: "en" }, german, german, "zh").title,
    "手动标题",
  );
  assert.deepEqual(autoPolicyIdentity(body, policyForm(), policyForm()), body);
});
test("clearing then reselecting country or policy type regenerates automatic fields but keeps manual values", () => {
  const generated = autoPolicyIdentity(body, policyForm(), german);
  for (const clearedPolicy of [
    { ...german, countryCode: null },
    { ...german, policyType: null },
  ]) {
    const cleared = autoPolicyIdentity(generated, german, clearedPolicy);
    assert.equal(cleared.title, "");
    assert.equal(cleared.contentKey, "");
    assert.equal(cleared.slug, "");
    const french = { ...german, countryCode: "FR", countryNameZh: "法国", countryNameEn: "France" };
    const reselected = autoPolicyIdentity(cleared, clearedPolicy, french);
    assert.equal(reselected.contentKey, "fr-unilateral-visa-free");
    assert.equal(reselected.title, "法国 · 单方面免签");
    const manual = {
      ...generated,
      title: "手动标题",
      contentKey: "manual-key",
      slug: "manual-url",
    };
    assert.deepEqual(autoPolicyIdentity(manual, german, clearedPolicy), manual);
  }
});
