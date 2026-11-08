import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyTrust } from "../../src/components/CompanyTrust";
assert.equal(renderToStaticMarkup(<CompanyTrust locale="en" company={null} />), "");
for (const locale of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(
    <CompanyTrust
      locale={locale}
      company={{
        companyName: "<script>fixture</script>",
        email: "demo@example.invalid",
        phone: "+00 000",
        location: "Fictional place",
      }}
    />,
  );
  assert.match(html, /data-company-info/);
  assert.match(html, /&lt;script&gt;fixture&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|SHANGHAI|待核实|pending verification/);
  assert.match(html, /mailto:demo@example.invalid/);
  assert.match(html, /Fictional place/);
  const partial = renderToStaticMarkup(<CompanyTrust locale={locale} company={{ phone: "123" }} />);
  assert.match(partial, /123/);
  assert.doesNotMatch(partial, /mailto:|Shanghai|公司主体/);
}
console.log("PASS configured/empty/partial public company SSR, text escaping and contact link");
