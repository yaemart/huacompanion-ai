import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyNoteWorkbench } from "../../src/components/content/PolicyNoteWorkbench";
import type { readSharedPolicyNote } from "../../src/server/immigration/shared-notes-service";
type Desk = Awaited<ReturnType<typeof readSharedPolicyNote>>;
const initial = {
  group: { id: 9, contentKey: "demo", activeFactVersion: 12 },
  locale: "en",
  facts: {
    countryNameZh: "演示",
    countryNameEn: "DEMO",
    policyType: "transit-240h",
    maxStayDays: null,
    maxStayHours: 240,
    validFrom: "2026-01-01",
    validUntil: "2027-01-01",
    portsAndRegions: ["须持前往第三国的联程票"],
    officialSourceUrl: "https://example.invalid/official",
    lastVerifiedOn: "2026-11-08",
  },
  factRevision: 2,
  draft: {
    id: 1,
    revision: 3,
    title: "English DEMO",
    slug: "demo",
    publicNotes: "  240 hours\n原文  ",
    reviewState: "draft",
    needsReview: true,
    basedOnFactVersion: 11,
    contributors: [1],
  },
  versions: [{ id: 15, revision: 1, createdAt: "2026-11-16T16:00:00Z" }],
  defaultBody: { title: "default", slug: "demo", publicNotes: "" },
  permissions: { canEdit: true, canReview: false, isAdmin: false, userId: 1 },
} as unknown as Desk;
const render = (patch: Partial<Desk> = {}) =>
  renderToStaticMarkup(<PolicyNoteWorkbench initial={{ ...initial, ...patch }} />);
const published = render({
  draft: { ...initial.draft!, publishedNoteVersion: 15 },
});
assert.match(published, /本语说明 · 已发布版本 · 第 1 版 · 2026-11-17（待复核，公开页暂不展示）/);
const button = (html: string, label: string) => {
  const value = html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
  assert.ok(value, `missing button: ${label}`);
  return value;
};
let html = render();
assert.match(html, /英文公开说明/);
assert.match(html, /共用事实 · 已发布版本 · 第 2 版/);
assert.match(html, /待复核/);
assert.match(html, /重新核对/);
assert.match(html, /240 小时/);
assert.match(html, /前往第三国/);
assert.match(html, /https:\/\/example.invalid\/official/);
assert.match(html, /建议将日期/);
assert.match(html, / {2}240 hours\n原文 {2}/);
assert.ok(!html.includes('type="number"'));
assert.ok(!button(html, "另存第 1 版为草稿").includes("disabled"));
assert.match(button(html, "审核发布本语说明"), /disabled/);
assert.match(button(html, "提交草稿审核"), /disabled/);
assert.ok(
  !button(
    render({ draft: { ...initial.draft!, basedOnFactVersion: 12 } }),
    "提交草稿审核",
  ).includes("disabled"),
);
html = render({
  facts: null,
  factRevision: null,
  group: { ...initial.group, activeFactVersion: null },
});
assert.match(html, /共用事实尚无已发布版本/);
assert.match(button(html, "提交草稿审核"), /disabled/);
html = render({
  permissions: { ...initial.permissions, canEdit: false, canReview: true, userId: 2 },
});
assert.match(button(html, "保存草稿"), /disabled/);
assert.match(button(html, "另存第 1 版为草稿"), /disabled/);
assert.match(html, /已按当前事实逐项核对本语说明/);
html = render({
  draft: { ...initial.draft!, reviewState: "review" },
  permissions: { ...initial.permissions, canReview: true },
});
assert.match(html, /本人编辑或提交/);
assert.match(button(html, "另存第 1 版为草稿"), /disabled/);
assert.match(button(html, "审核发布本语说明"), /disabled/);
console.log(
  "PASS note editor formal facts/read-only roles, language, stale warning, raw text, numeric hint and history/review button guards",
);
