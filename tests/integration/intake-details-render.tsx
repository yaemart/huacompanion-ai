import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeDetailsCard } from "../../src/cms/IntakeDetailsField";

const html = renderToStaticMarkup(
  <IntakeDetailsCard
    title="需求详情（初始提交）"
    value={{ purpose: "<script>bad</script>\n下一行" }}
  />,
);
assert.match(html, /<dl/);
assert.match(html, /展会或访问目的/);
assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>|<textarea|<input|contenteditable|\[object Object\]/);
assert.match(html, /white-space:pre-wrap/);
assert.match(html, /overflow-wrap:anywhere/);
assert.match(
  renderToStaticMarkup(<IntakeDetailsCard title="资料" value={null} />),
  /未提供初始资料/,
);
console.log(
  "PASS real details card: Chinese fields, read-only, escaping, long text and empty state",
);
