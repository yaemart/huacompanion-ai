import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyCountryField } from "../../src/components/content/PolicyCountryField";
import { PolicyIdentityFields } from "../../src/components/content/PolicyIdentityFields";
import { policyCountryOptions } from "../../src/lib/immigration-policy-entry";
import { policyForm } from "../../src/lib/immigration-policy-editor";
import type { ContentBody } from "../../src/lib/content-model";
const value = {
  ...policyForm(),
  countryCode: "DE",
  countryNameEn: "Germany",
  countryNameZh: "德国",
};
const html = renderToStaticMarkup(
  <fieldset disabled>
    <PolicyCountryField value={value} countries={policyCountryOptions(false)} onChange={() => {}} />
  </fieldset>,
);
for (const text of ["搜索国家", "国家", "Germany", "德国", "DE"]) assert.ok(html.includes(text));
assert.match(html, /<input[^>]*type="search"/);
assert.match(html, /value="DE" selected=""/);
assert.doesNotMatch(html, /<script|<iframe|https:\/\//);
const old = renderToStaticMarkup(
  <PolicyCountryField
    value={{ ...value, countryCode: "XY", countryNameZh: "原有虚构名称" }}
    countries={policyCountryOptions(false)}
    onChange={() => {}}
  />,
);
assert.ok(old.includes("原代码不在名单，请重新选择"));
assert.ok(old.includes("原有虚构名称"));
const body: ContentBody = {
  kind: "immigration-policy",
  locale: "zh",
  contentKey: "de-unilateral-visa-free",
  slug: "de-unilateral-visa-free",
  title: "德国 · 单方面免签",
  blocks: [],
  sources: [],
};
const fields = renderToStaticMarkup(
  <PolicyIdentityFields body={body} existing={false} published={false} onChange={() => {}} />,
);
assert.match(fields, /<details><summary>/);
assert.doesNotMatch(fields, /<details[^>]*open|disabled=""/);
for (const label of ["高级", "标题", "内容标识", "网址标识", "语言"])
  assert.ok(fields.includes(label));
const locked = renderToStaticMarkup(
  <PolicyIdentityFields body={body} existing published onChange={() => {}} />,
);
assert.match(locked, /<input[^>]*disabled=""[^>]*value="de-unilateral-visa-free"/);
assert.match(locked, /<select disabled=""/);
const legacy = renderToStaticMarkup(
  <PolicyIdentityFields body={{ ...body, locale: "es" }} existing published onChange={() => {}} />,
);
assert.match(legacy, /<option value="es" selected="">es<\/option>/);
console.log(
  "PASS native country search/select, existing invalid-code prompt, preserved names, no external resources and collapsed/manual/locked advanced fields",
);
