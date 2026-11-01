import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyTable } from "../../src/components/immigration/PolicyTable";
import { buildPolicyTable } from "../../src/lib/immigration-policy-table";
import { queryPolicy } from "../helpers/policy-query-fixture";

for (const locale of ["en", "zh"] as const) {
  const rows = buildPolicyTable(
    [
      queryPolicy({
        countryNameEn: "<script>alert('country')</script>",
        publicNotes: "<img src=x onerror=alert(1)>",
      }),
      queryPolicy({ policyType: "transit-240h", validUntil: null }),
      queryPolicy({ validUntil: "2026-10-31" }),
      queryPolicy({ validFrom: "2026-11-02" }),
    ],
    "2026-11-01",
  );
  const html = renderToStaticMarkup(React.createElement(PolicyTable, { rows, locale }));
  assert.equal((html.match(/<tr/g) || []).length, 5);
  assert.equal((html.match(/scope="col"/g) || []).length, 6);
  assert.equal((html.match(/scope="row"/g) || []).length, 4);
  assert.match(html, /<caption/);
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /2026-01-01/);
  assert.match(html, /href="https:\/\/example.invalid\/policy"/);
  assert.match(html, /240/);
  assert.match(html, locale === "zh" ? /小时/ : /hours/);
  assert.match(html, locale === "zh" ? /该日期的政策尚未确认/ : /not yet confirmed/);
  assert.match(html, locale === "zh" ? /尚未生效/ : /Not yet effective/);
  assert.match(html, locale === "zh" ? /不代表永久/ : /not mean.*permanent/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script|<img|<form|<input| onclick=/i);
  const empty = renderToStaticMarkup(React.createElement(PolicyTable, { rows: [], locale }));
  assert.doesNotMatch(empty, /<table|Fictional|虚构/);
  assert.match(empty, locale === "zh" ? /资料正在核实/ : /Records are being verified/);
}
const all = buildPolicyTable(
  Array.from({ length: 201 }, () => queryPolicy()),
  "2026-11-01",
);
assert.equal(
  (
    renderToStaticMarkup(React.createElement(PolicyTable, { rows: all, locale: "en" })).match(
      /scope="row"/g,
    ) || []
  ).length,
  201,
);
console.log(
  "PASS bilingual no-JS static table: full rows, semantics, sources, conditions, escaping and empty state",
);
