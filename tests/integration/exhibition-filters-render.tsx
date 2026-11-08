import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { SiteProvider } from "../../src/components/SiteContext";
import { PublicNavigationProvider } from "../../src/components/PublicNavigation";
import { emptyExhibition } from "../../src/lib/exhibitions";
import type { ContentBody } from "../../src/lib/content-model";
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
      <PublicNavigationProvider value={{ origin: "http://127.0.0.1:3100", paths: [] }}>
        <PathnameContext.Provider value="/en">
          <SearchParamsContext.Provider value={new URLSearchParams(query)}>
            <AppRouterContext.Provider value={router}>{child}</AppRouterContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </PublicNavigationProvider>
    </SiteProvider>,
  );
}
const { registerHooks } = await import("node:module");
const css = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export {}", shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { ExhibitionPage } = await import("../../src/components/exhibitions/ExhibitionPage");
css.deregister();
const event = (title: string, startDate: string, endDate: string): ContentBody => ({
  contentKey: title,
  kind: "exhibition",
  locale: "en",
  slug: title,
  title,
  blocks: [],
  sources: [],
  exhibition: {
    ...emptyExhibition(),
    status: "announced",
    startDate,
    endDate,
    city: "shanghai",
    industries: ["hardware"],
  },
});
const items = [
  event("future-fixture", "2099-12-29", "2100-01-02"),
  event("past-fixture", "2020-01-01", "2020-01-02"),
];
const html = render(<ExhibitionPage locale="en" items={items} />);
assert.match(html, /<details class="exhibition-filter-disclosure">/);
assert.match(html, /<summary[^>]*>Filters/);
assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|>)/);
assert.match(html, /<select name="month">/);
assert.doesNotMatch(html, /type="month"/);
assert.match(html, /<option value="2099-12"/);
assert.match(html, /<option value="2100-01"/);
assert.match(html, /href="\/en\/exhibitions\/future-fixture"/);
assert.doesNotMatch(html, /href="\/en\/exhibitions\/past-fixture"/);
const past = render(
  <ExhibitionPage locale="en" items={items} query={{ period: "past", month: "2020-01" }} />,
);
assert.match(past, /<option value="2020-01" selected="">/);
assert.match(past, /href="\/en\/exhibitions\/past-fixture"/);
assert.doesNotMatch(past, /href="\/en\/exhibitions\/future-fixture"/);
const empty = render(<ExhibitionPage locale="en" items={items} query={{ month: "2080-01" }} />);
assert.match(empty, /<option value="2080-01" selected="">/);
assert.match(empty, /No published exhibitions/);
assert.match(empty, /href="\/en\/exhibitions"/);
console.log(
  "PASS native collapsed GET filters, month options, default upcoming, archive and empty result recovery",
);
const all = render(<ExhibitionPage locale="en" items={items} query={{ period: "all" }} />);
assert.match(all, /href="\/en\/exhibitions\/past-fixture"/);
assert.match(all, /href="\/en\/exhibitions\/future-fixture"/);
const many = Array.from({ length: 13 }, (_, i) => event(`fair-${i}`, "2099-12-29", "2100-01-02"));
const paged = render(
  <ExhibitionPage
    locale="en"
    items={many}
    query={{
      city: "shanghai",
      industry: "hardware",
      month: "2099-12",
      q: "fair",
      period: "upcoming",
    }}
  />,
);
assert.match(
  paged,
  /city=shanghai&amp;industry=hardware&amp;month=2099-12&amp;q=fair&amp;period=upcoming&amp;page=2/,
);
assert.doesNotMatch(paged.match(/<form[\s\S]*?<\/form>/)?.[0] || "", /name="page"/);
const chinese = render(<ExhibitionPage locale="zh" items={items} />);
assert.match(chinese, /<summary[^>]*>筛选/);
assert.match(chinese, /全部月份/);
assert.doesNotMatch(chinese, /value="2099-12"/);
