import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeCasePanel } from "../../src/cms/IntakeCasePanel";
const base = {
  title: "虚构 <script>x</script>",
  busy: false,
  dirty: false,
  phase: "ready" as const,
  message: "",
  onTitle: () => {},
  onCreate: () => {},
  onRetry: () => {},
};
const create = renderToStaticMarkup(<IntakeCasePanel {...base} />);
assert.match(create, /转为服务单/);
assert.match(create, /type="button"/);
assert.match(create, /&lt;script&gt;x&lt;\/script&gt;/);
assert.doesNotMatch(create, /<script>/);
const dirty = renderToStaticMarkup(<IntakeCasePanel {...base} dirty />);
assert.match(dirty, /先保存/);
assert.match(dirty, /disabled/);
const existing = renderToStaticMarkup(<IntakeCasePanel {...base} caseID={27} />);
assert.match(existing, /href="\/business-center\?id=27"/);
assert.match(existing, /target="_blank"/);
assert.match(existing, /noopener/);
assert.doesNotMatch(existing, /<button[^>]*>转为服务单/);
assert.match(
  renderToStaticMarkup(<IntakeCasePanel {...base} phase="error" message="读取失败" />),
  /重新读取/,
);
assert.match(renderToStaticMarkup(<IntakeCasePanel {...base} phase="unsaved" />), /先保存咨询/);
console.log(
  "PASS E3 saved/dirty/existing/error/new-record panel SSR, escaping and safe new-tab link",
);
