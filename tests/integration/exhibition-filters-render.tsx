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
import { assertExhibitionPreview } from "../helpers/exhibition-preview-render";
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

const { ExhibitionFields } = await import("../../src/components/content/ExhibitionFields");
const visitor = {
  ...items[0],
  exhibition: {
    ...items[0].exhibition!,
    venue: "Fictional hall",
    address: "Fictional address",
    phases: [
      {
        name: "Phase <one>",
        startDate: "2099-12-30",
        endDate: "2100-01-01",
        theme: "Tools\n<script>PRIVATE_SCRIPT</script>",
      },
      { name: "Pending phase", startDate: "", endDate: "", theme: "Future themes" },
    ],
    transport: "Fictional transit\n" + "LongText".repeat(60),
    buyerRegistration: "Fictional buyer registration",
    stayAreas: "Fictional lodging area",
    firstVisitTips: "Fictional tips",
  },
};
const editor = render(
  <ExhibitionFields value={visitor.exhibition} onChange={() => {}} choices={[]} locale="en" />,
);
assert.match(editor, /添加分期/);
assert.match(editor, /分期名称/);
assert.match(editor, /外国买家登记/);
assert.match(editor, /推荐住宿区域/);
assert.match(editor, /首次参展提示/);
assert.match(editor, /Fictional buyer registration/);
const detail = render(<ExhibitionPage locale="en" items={[visitor]} detail={visitor} />);
assert.match(
  detail,
  /href="\/api\/public\/exhibitions\/calendar\?locale=en&amp;key=future-fixture"/,
);
assert.match(detail, /One-time import/);
for (const status of ["pending", "postponed", "cancelled"] as const) {
  const unavailable = { ...visitor, exhibition: { ...visitor.exhibition!, status } };
  const html = render(<ExhibitionPage locale="en" items={[unavailable]} detail={unavailable} />);
  assert.doesNotMatch(html, /href="\/api\/public\/exhibitions\/calendar/);
  assert.match(html, /Calendar download is unavailable/);
}
assert.match(detail, /Phase &lt;one&gt;/);
assert.match(detail, /Fictional lodging area/);
assert.match(detail, /Tools\n&lt;script&gt;PRIVATE_SCRIPT&lt;\/script&gt;/);
assert.doesNotMatch(detail, /<script>PRIVATE_SCRIPT/);
assert.match(detail, /2099-12-30 — 2100-01-01/);
assert.match(detail, /Pending phase/);
assert.match(detail, /To be confirmed/);
const jsonLD = JSON.parse(
  detail.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)![1],
);
assert.equal(jsonLD.startDate, "2099-12-29");
assert.equal(jsonLD.endDate, "2100-01-02");
assert.equal(jsonLD.subEvent, undefined);
assert.doesNotMatch(
  render(<ExhibitionPage locale="en" items={items} detail={items[0]} />),
  /exhibition-phases|exhibition-visitor/,
);
for (const [locale, label] of [
  ["en", "Transport"],
  ["zh", "交通"],
  ["es", "Transporte"],
  ["fr", "Transports"],
  ["de", "Anreise"],
  ["it", "Trasporti"],
  ["ar", "المواصلات"],
] as const) {
  const localized = {
    ...visitor,
    locale,
    exhibition: { ...visitor.exhibition, transport: `Only ${locale} transit` },
  };
  const page = render(
    <ExhibitionPage locale={locale} items={[visitor, localized]} detail={localized} />,
  );
  assert.ok(page.includes(label), locale + " visitor label");
  assert.ok(page.includes(`Only ${locale} transit`));
  assert.ok(
    page.includes(`/api/public/exhibitions/calendar?locale=${locale}&amp;key=future-fixture`),
  );
  if (locale !== "en") assert.ok(!page.includes("One-time import"));
  assert.ok(!page.includes("Fictional transit"), "no other locale's visitor content");
}
console.log(
  "PASS phase/visitor editor and seven-language details, escaping, legacy omission and original event dates",
);
await assertExhibitionPreview(visitor);
console.log("PASS real draft preview renders saved phase and visitor facts with escaping");
