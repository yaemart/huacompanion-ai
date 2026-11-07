import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyQuery } from "../../src/components/immigration/PolicyQuery";
import { PolicyQueryResult } from "../../src/components/immigration/PolicyQueryResult";
import { queryImmigrationPolicies } from "../../src/lib/immigration-policy-query";
import { queryContext, queryPolicy } from "../helpers/policy-query-fixture";

for (const locale of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(
    React.createElement(
      PolicyQuery,
      { locale, policies: [queryPolicy()], ...queryContext },
      React.createElement("p", null, "Complete server-rendered reference"),
    ),
  );
  assert.match(html, /<fieldset disabled/);
  assert.match(html, /<label[^>]*for="policy-nationality"/);
  assert.match(html, /<label[^>]*for="policy-arrival"/);
  assert.match(html, /type="date"/);
  assert.match(html, /value="__unlisted__"/);
  assert.match(html, /type="button"/);
  assert.match(html, /autocomplete="off"/i);
  assert.match(html, /role="status"/);
  assert.match(html, /<details[^>]*open=""/);
  assert.match(html, /<summary[^>]*>/);
  assert.match(html, /Complete server-rendered reference/);
  assert.doesNotMatch(html, /<form|\sname=|\saction=|<script/i);
  assert.doesNotMatch(html, /value="2026-11-01"/);
  const matched = queryImmigrationPolicies(
    { nationalityISO: "XY", arrivalDate: "2026-01-01" },
    [
      queryPolicy({
        policyType: "transit-240h",
        validUntil: null,
        publicNotes: "<img src=x onerror=alert(1)>",
      }),
    ],
    queryContext,
  );
  const result = renderToStaticMarkup(
    React.createElement(PolicyQueryResult, { result: matched, locale }),
  );
  assert.match(result, /240/);
  assert.match(result, locale === "zh" ? /小时/ : /hours/);
  assert.match(result, /https:\/\/example.invalid\/policy/);
  assert.match(result, /2026-01-01/);
  assert.match(result, locale === "zh" ? /第三国/ : /third-country/);
  assert.match(result, /&lt;img/);
  assert.doesNotMatch(result, /<img|<script|departure|2026-01-11/);
  const unconfirmed = queryImmigrationPolicies(
    { nationalityISO: null, arrivalDate: "2031-07-29" },
    [],
    queryContext,
  );
  const unknown = renderToStaticMarkup(
    React.createElement(PolicyQueryResult, { result: unconfirmed, locale }),
  );
  assert.match(unknown, /href="\/en\/guides\/fictional-visa-guide"/);
  assert.match(unknown, locale === "zh" ? /该日期的政策尚未确认/ : /not yet confirmed/);
  const noGuide = renderToStaticMarkup(
    React.createElement(PolicyQueryResult, { result: { ...unconfirmed, visaGuide: null }, locale }),
  );
  assert.doesNotMatch(noGuide, /href=/);
  const invalid = queryImmigrationPolicies(
    { nationalityISO: "", arrivalDate: "" },
    [],
    queryContext,
  );
  const error = renderToStaticMarkup(
    React.createElement(PolicyQueryResult, { result: invalid, locale }),
  );
  assert.match(error, locale === "zh" ? /有效的入境日期/ : /valid arrival date/);
  assert.doesNotMatch(error, /<article/);
}
console.log(
  "PASS bilingual pre-hydration privacy, query result states, source/date/hour conditions and safe guide rendering",
);
