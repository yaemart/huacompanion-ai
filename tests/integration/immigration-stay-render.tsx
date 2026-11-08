import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyFields } from "../../src/components/content/PolicyFields";
import { policyForm } from "../../src/lib/immigration-policy-editor";
import { changePolicyType } from "../../src/lib/immigration-policy-stay";
import { PolicyQueryResult } from "../../src/components/immigration/PolicyQueryResult";
import { PolicyTable } from "../../src/components/immigration/PolicyTable";
import { buildPolicyTable } from "../../src/lib/immigration-policy-table";
import { queryImmigrationPolicies } from "../../src/lib/immigration-policy-query";
import { queryContext, queryPolicy } from "../helpers/policy-query-fixture";
const render = (type: "unilateral" | "bilateral" | "transit-240h") =>
  renderToStaticMarkup(
    <PolicyFields
      value={changePolicyType(policyForm(), type)}
      countries={[]}
      verifiers={[]}
      onChange={() => {}}
    />,
  );
assert.match(render("unilateral"), /最长停留（天）/);
assert.match(render("unilateral"), /value="30"/);
assert.doesNotMatch(render("bilateral"), /value="30"/);
const transit = render("transit-240h");
assert.match(transit, /最长停留（小时）/);
assert.doesNotMatch(transit, /最长停留（天）/);
assert.match(transit, /value="240"/);
assert.match(transit, /<textarea required=""/);
const row = {
  ...queryPolicy({ policyType: "transit-240h" }),
  maxStayDays: null,
  maxStayHours: 144,
};
const result = queryImmigrationPolicies(
  { nationalityISO: "XY", arrivalDate: "2026-01-01" },
  [row],
  queryContext,
);
for (const locale of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(<PolicyQueryResult result={result} locale={locale} />);
  assert.ok(html.includes(locale === "en" ? "144 hours" : "144 小时"));
  const table = renderToStaticMarkup(
    <PolicyTable rows={buildPolicyTable([row], queryContext.verifiedOnOrBefore)} locale={locale} />,
  );
  assert.ok(table.includes(locale === "en" ? "144 hours" : "144 小时"));
}
console.log(
  "PASS editor day/hour labels/defaults/ports requirement and bilingual public card/table match explicit hours",
);
