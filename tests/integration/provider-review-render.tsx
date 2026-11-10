import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderReviewPanel } from "../../src/cms/ProviderReviewPanel";
import { ProviderOptionsPanel } from "../../src/cms/ProviderOptionsPanel";
const panel = (allowed: boolean, dirty = false) =>
  renderToStaticMarkup(
    <ProviderReviewPanel
      allowed={allowed}
      busy={false}
      dirty={dirty}
      reason="<script>"
      message=""
      onReason={() => {}}
      onReview={() => {}}
    />,
  );
const html = panel(true);
for (const label of ["核实通过", "签约", "暂停"]) assert.match(html, new RegExp(label));
assert.match(html, /&lt;script&gt;/);
assert.doesNotMatch(html, /<script>/);
assert.doesNotMatch(panel(false), /<button/);
assert.match(panel(false), /主管/);
assert.match(panel(true, true), /disabled/);
assert.match(panel(true, true), /先保存/);
const options = () => (
  <ProviderOptionsPanel
    kind="languages"
    path="languages"
    value="English"
    disabled={false}
    onChange={() => {}}
  />
);
const twins = renderToStaticMarkup(
  <>
    {options()}
    {options()}
  </>,
);
const ids = [...twins.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length);
console.log("PASS actual review panel roles/actions/dirty/escaping and distinct option help IDs");
