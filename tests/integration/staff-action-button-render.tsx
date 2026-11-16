import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StaffActionButton } from "../../src/components/admin/StaffActionButton";
const markup = renderToStaticMarkup(
  <>
    <StaffActionButton reason="请先保存修改。">提交审核</StaffActionButton>
    <StaffActionButton reason="请先填写审核意见。">通过</StaffActionButton>
    <StaffActionButton>保存草稿</StaffActionButton>
  </>,
);
const ids = Array.from(markup.matchAll(/aria-describedby="([^"]+)"/g), (match) => match[1]);
assert.equal(ids.length, 2);
assert.notEqual(ids[0], ids[1]);
assert.ok(markup.includes(`id="${ids[0]}">请先保存修改。`));
assert.ok(markup.includes(`id="${ids[1]}">请先填写审核意见。`));
assert.match(markup, /<button(?=[^>]*disabled)(?=[^>]*aria-describedby=)[^>]*>提交审核<\/button>/);
assert.match(markup, /<button type="button">保存草稿<\/button>/);
assert.doesNotMatch(markup, /title=/);
console.log("PASS disabled actions expose one visible associated explanation each");
