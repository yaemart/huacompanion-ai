import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicFooter } from "../../src/components/PublicFooter";
import { PublicNavigationProvider } from "../../src/components/PublicNavigation";
import { locales } from "../../src/lib/locales";
for (const locale of locales) {
  const html = renderToStaticMarkup(
    <PublicNavigationProvider
      value={{
        origin: "https://hua.example",
        paths: [`/${locale}/services`, `/${locale}/guides`, `/${locale}/contact`],
      }}
    >
      <PublicFooter locale={locale} />
    </PublicNavigationProvider>,
  );
  assert.equal((html.match(/<footer\b/g) || []).length, 1);
  assert.match(html, /class="footer-main"/);
  assert.match(html, new RegExp(`href="/${locale}/request"`));
  assert.match(html, new RegExp(`href="/${locale}/contact"`));
  assert.match(html, new RegExp(`href="/${locale}/privacy"`));
  assert.match(html, new RegExp(`href="/${locale}/terms"`));
  assert.match(html, /HUA COMPANION/);
  assert.doesNotMatch(
    html,
    /llms\.txt|\/api\/public|data for agents|Shanghai|上海|pending verification|待核实|mailto:|tel:/,
  );
  assert.doesNotMatch(html, new RegExp(`href="/${locale}/partners"`));
  const empty = renderToStaticMarkup(
    <PublicNavigationProvider value={{ origin: "https://hua.example", paths: [] }}>
      <PublicFooter locale={locale} />
    </PublicNavigationProvider>,
  );
  assert.doesNotMatch(
    empty,
    new RegExp(`href="/${locale}/(services|guides|about|contact|partners)"`),
  );
  assert.match(empty, new RegExp(`href="/${locale}/request"`));
}
console.log(
  "PASS shared footer seven-language paths, contact/privacy/boundary links, empty navigation and no invented company/agent details",
);
