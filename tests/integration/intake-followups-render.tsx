import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FollowUpHistory } from "../../src/cms/FollowUpHistory";
const html = renderToStaticMarkup(
  <FollowUpHistory rows={[{ id: "legacy", body: "  旧文\n<script>x</script>", legacy: true }]} />,
);
assert.match(html, /旧备注（原时间／记录人未记录）/);
assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
assert.doesNotMatch(html, /<textarea|<input|<script>/);
assert.match(html, /white-space:pre-wrap/);
assert.match(html, /overflow-wrap:anywhere/);
assert.match(renderToStaticMarkup(<FollowUpHistory rows={[]} />), /暂无跟进记录/);
console.log(
  "PASS immutable history SSR: legacy unknown metadata, original text, escaping and empty state",
);
