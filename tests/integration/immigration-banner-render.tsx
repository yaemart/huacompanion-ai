import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyBannerView } from "../../src/components/immigration/PolicyBannerView";
import { PolicyBannerFields } from "../../src/components/content/PolicyBannerFields";
import { queryPolicy } from "../helpers/policy-query-fixture";

for (const locale of ["en", "zh"] as const) {
  const policy = queryPolicy({
    countryNameEn: "Fictional <script>alert(1)</script>",
    countryNameZh: "虚构测试国家",
  });
  const previous = queryPolicy({
    validUntil: "2026-11-12",
    officialSourceUrl: "https://example.invalid/previous",
  });
  const html = renderToStaticMarkup(
    <PolicyBannerView
      model={{ status: "extended", policy, previous }}
      locale={locale}
      href={`/${locale}/tools/china-visa-free-checker`}
    />,
  );
  assert.match(html, /data-policy-banner="extended"/);
  assert.match(html, /2026-11-12/);
  assert.match(html, /2026-12-31/);
  assert.match(html, /https:\/\/example.invalid\/previous/);
  assert.match(html, /https:\/\/example.invalid\/policy/);
  assert.match(html, /2026-01-01/);
  assert.doesNotMatch(html, /<script>|verifiedBy|internalNotes/);
  assert.match(html, locale === "zh" ? /已延长/ : /extended/i);
  for (const status of ["expiring", "unconfirmed"] as const) {
    const h = renderToStaticMarkup(
      <PolicyBannerView
        model={{ status, policy: status === "unconfirmed" ? null : policy, previous: null }}
        locale={locale}
      />,
    );
    assert.match(h, new RegExp(`data-policy-banner="${status}"`));
    assert.doesNotMatch(h, /\/tools\/|<script|<form/);
  }
  assert.equal(renderToStaticMarkup(<PolicyBannerView model={null} locale={locale} />), "");
}
const fields = renderToStaticMarkup(
  <PolicyBannerFields
    value={{ type: "policy-banner", text: "policy-test", policyUnconfirmed: true }}
    onChange={() => {}}
  />,
);
assert.match(fields, /value="policy-test"/);
assert.match(fields, /checked=""/);
assert.match(fields, /内容标识/);
assert.match(fields, /type="checkbox"/);
console.log(
  "PASS bilingual banner states, reviewed date/source evidence, safe text, null/no-link and structured editor controls",
);
