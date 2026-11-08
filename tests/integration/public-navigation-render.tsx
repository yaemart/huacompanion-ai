import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { Header } from "../../src/components/Header";
import { PublishedGuides } from "../../src/components/content/PublishedGuides";
import {
  PublicNavigationProvider,
  PublishedLink,
  VisaCheckerLink,
} from "../../src/components/PublicNavigation";
import { SiteProvider } from "../../src/components/SiteContext";
import { buildPublicNavigation } from "../../src/lib/public-navigation";
import type { ContentBody } from "../../src/lib/content-model";
const docs: ContentBody[] = [
  {
    kind: "guide",
    locale: "en",
    slug: "test",
    contentKey: "test",
    title: "Published guide",
    category: 2,
    blocks: [],
    sources: [],
  },
];
const data = buildPublicNavigation(docs, "http://127.0.0.1:3137");
const router = {
  bfcacheId: "test",
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  hmrRefresh() {},
};
function render(child: React.ReactNode, enabled = true, query = "") {
  return renderToStaticMarkup(
    <SiteProvider
      value={{
        activeLocales: ["en", "zh"],
        features: { customerCenter: false, textChat: false },
        visaChecker: enabled,
      }}
    >
      <PublicNavigationProvider value={data}>
        <PathnameContext.Provider value="/en">
          <SearchParamsContext.Provider value={new URLSearchParams(query)}>
            <AppRouterContext.Provider value={router}>{child}</AppRouterContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </PublicNavigationProvider>
    </SiteProvider>,
  );
}
const emptyMenu =
  render(
    <PublicNavigationProvider value={buildPublicNavigation([], "http://127.0.0.1:3137")}>
      <Header locale="en" />
    </PublicNavigationProvider>,
    false,
  ).match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert.match(emptyMenu, /href="\/en\/?"/);
assert.doesNotMatch(emptyMenu, /href="\/en\/(services|guides|tools)/);
const menu = render(<Header locale="en" />);
assert.match(menu, /href="\/en\/guides"/);
assert.doesNotMatch(
  menu,
  /href="\/en\/(services|providers|life|institutions|exhibitions|partners|about|contact)"/,
);
assert.match(menu, /href="\/en\/tools\/china-visa-free-checker"/);
assert.doesNotMatch(render(<Header locale="en" />, false), /china-visa-free-checker/);
assert.match(
  render(<VisaCheckerLink locale="en" />),
  /href="\/en\/tools\/china-visa-free-checker"/,
);
assert.doesNotMatch(render(<VisaCheckerLink locale="en" />, false), /href=/);
assert.doesNotMatch(render(<VisaCheckerLink locale="fr" />), /href=/);
assert.match(
  render(<PublishedLink href="/en/services/missing">Unavailable service</PublishedLink>),
  /<span>Unavailable service<\/span>/,
);
assert.match(
  render(
    <PublishedLink href="https://elsewhere.example/en/services/missing">
      External source
    </PublishedLink>,
  ),
  /href="https:\/\/elsewhere.example/,
);
const guides = render(<PublishedGuides items={docs} locale="en" />);
assert.match(guides, /Business &amp; exhibitions/);
assert.doesNotMatch(guides, /Stays &amp; everyday life|>0\s*published/);
const empty = render(<PublishedGuides items={docs} locale="en" />, true, "section=stays");
assert.match(empty, /0 results/);
assert.match(empty, /All content/);
assert.doesNotMatch(empty, /href="\/en\/guides\/test"/);
console.log(
  "PASS navigation, bilingual feature gate, protected links and empty knowledge category rendering",
);

const { registerHooks } = await import("node:module");
const css = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export {}", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { CatalogPage } = await import("../../src/components/catalog/CatalogPage");
css.deregister();
const emptyCatalog = render(<CatalogPage items={[]} locale="en" kind="provider-profile" />);
assert.doesNotMatch(emptyCatalog, /aria-label="Service navigation"/);
const project = {
  ...docs[0],
  kind: "service-project" as const,
  slug: "factory",
  contentKey: "project",
};
const catalog = render(<CatalogPage items={[project]} locale="en" kind="provider-profile" />);
const subnavigation =
  catalog.match(/<nav aria-label="Service navigation"[\s\S]*?<\/nav>/)?.[0] || "";
assert.match(subnavigation, /href="\/en\/services\/projects"/);
assert.doesNotMatch(subnavigation, /href="\/en\/providers"/);
console.log("PASS catalog subnavigation hides empty directories");
