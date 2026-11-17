import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogFields } from "../../src/components/content/CatalogFields";
import { ExhibitionFields } from "../../src/components/content/ExhibitionFields";
import { InstitutionFields } from "../../src/components/content/InstitutionFields";
import { emptyCatalog } from "../../src/lib/catalog";
import { emptyExhibition } from "../../src/lib/exhibitions";
import { emptyInstitution } from "../../src/lib/institutions";

const shared = { onChange: () => {}, choices: [] };
const exhibition = renderToStaticMarkup(
  <ExhibitionFields
    {...shared}
    locale="zh"
    value={{ ...emptyExhibition(), exhibits: "原有展品资料" }}
  />,
);
const link = exhibition.match(/<textarea[^>]+aria-describedby="([^"]+)"/)?.[1];
assert.ok(link && exhibition.includes(`id="${link}"`), "fields must reference the visible example");
assert.match(exhibition, /填写示例/);
assert.match(exhibition, /<button[^>]+type="button"[^>]+aria-label="为适合观众插入模板"/);
assert.match(exhibition, /<textarea[^>]*>原有展品资料<\/textarea>/);
assert.doesNotMatch(exhibition, /为展品范围插入模板|为场馆插入模板/);

const catalog = renderToStaticMarkup(
  <CatalogFields {...shared} kind="service-project" locale="en" value={emptyCatalog()} />,
);
assert.match(catalog, /Interpreting during scheduled meetings/);
assert.match(catalog, /为服务流程插入模板/);
assert.doesNotMatch(catalog, /预约前确认日期和地点/);

const institution = renderToStaticMarkup(
  <InstitutionFields {...shared} locale="zh" value={emptyInstitution()} />,
);
assert.match(institution, /为预约方式与条件插入模板/);
assert.doesNotMatch(institution, /为公开资质核验说明插入模板/);
const pending = renderToStaticMarkup(
  <fieldset disabled>
    <InstitutionFields
      {...shared}
      locale="zh"
      value={{ ...emptyInstitution(), appointment: "Book through 〔official channel〕." }}
    />
  </fieldset>,
);
assert.match(pending, /模板还有待填文字，请按核实资料替换。/);
assert.doesNotMatch(pending, /为预约方式与条件插入模板/);

const existing = renderToStaticMarkup(
  <CatalogFields {...shared} kind="provider-profile" locale="zh" value={emptyCatalog()} />,
);
assert.doesNotMatch(existing, /填写示例|插入模板/);
console.log("PASS linked examples, optional buttons, language, and existing content");
