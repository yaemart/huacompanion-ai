import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyList } from "../../src/components/content/PolicyList";
import type { PolicyListRow } from "../../src/lib/immigration-policy-list";
const rows: PolicyListRow[] = [
  {
    id: 42,
    title: "虚构政策",
    locale: "zh",
    country: "虚构国家 XY",
    policyType: "transit-240h",
    reviewState: "returned",
    validUntil: "2026-12-01",
    lastVerifiedOn: "2026-11-08",
  },
];
const html = renderToStaticMarkup(
  <PolicyList
    rows={rows}
    today="2026-11-08"
    selectedId={42}
    disabled={false}
    onSelect={() => {}}
  />,
);
for (const label of ["国家", "类型", "状态", "截止日", "核实日", "待审核", "已退回", "30 天内到期"])
  assert.ok(html.includes(label), label);
assert.match(html, /aria-sort="ascending"/);
assert.match(html, /aria-current="true"/);
assert.match(html, /aria-label="政策列表（可横向滚动）"/);
assert.match(html, /tabindex="0"/);
assert.ok(html.includes("240小时过境"));
assert.ok(html.includes("2026-12-01"));
const empty = renderToStaticMarkup(
  <PolicyList rows={[]} today="2026-11-08" disabled={false} onSelect={() => {}} />,
);
assert.ok(empty.includes("没有符合条件的政策"));
const locked = renderToStaticMarkup(
  <PolicyList rows={rows} today="2026-11-08" selectedId={42} disabled={true} onSelect={() => {}} />,
);
assert.match(locked, /<button[^>]*disabled=""[^>]*aria-current="true"/);
console.log(
  "PASS policy list headers, filters, accessible sorting, current row, scroll region, empty and locked states",
);
