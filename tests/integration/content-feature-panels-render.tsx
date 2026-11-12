import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTasks } from "../../src/cms/content/collections";

const css = registerHooks({
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
    return next(url, context);
  },
});
try {
  const { ContentCenter } = await import("../../src/components/content/ContentCenter");
  const standard = renderToStaticMarkup(<ContentCenter initialKind="guide" />);
  assert.doesNotMatch(standard, /AI 内容任务|AI 生成的内容/);
  assert.match(standard, /编辑与发布/);
  assert.match(standard, /图片素材/);

  const available = renderToStaticMarkup(<ContentCenter initialKind="guide" contentAIAvailable />);
  assert.match(available, /<button[^>]*>AI 内容任务<\/button>/);
  assert.equal(AgentTasks.admin?.hidden, true);
  assert.equal(typeof AgentTasks.access?.read, "function");
} finally {
  css.deregister();
}
console.log("PASS content workspace panel visibility and CMS collection remains registered");
