import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderOptionsPanel } from "../../src/cms/ProviderOptionsPanel";
const render = (disabled = false) =>
  renderToStaticMarkup(
    <ProviderOptionsPanel
      kind="languages"
      path="languages"
      value="English、<script>alert(1)</script>"
      disabled={disabled}
      error="请至少选择一项"
      onChange={() => {}}
    />,
  );
const html = render();
assert.match(html, /type="checkbox"[^>]*checked=""[^>]*value="en"/);
assert.match(html, /待人工核对/);
assert.match(html, /&lt;script&gt;alert/);
assert.doesNotMatch(html, /<script>/);
assert.match(html, /type="button"/);
assert.match(html, /role="alert"/);
assert.match(render(true), /<fieldset[^>]*disabled=""/);
assert.match(html, /<legend[^>]*>支持语言/);
console.log(
  "PASS real provider option group SSR selection, legacy warning, escaping and disabled fields",
);
