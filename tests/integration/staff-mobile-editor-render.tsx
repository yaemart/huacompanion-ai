import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffActionButton } from "../../src/components/admin/StaffActionButton";
import { MobileSaveBar, StaffEditorGroup } from "../../src/components/admin/StaffMobileEditor";

const html = renderToStaticMarkup(
  <form aria-label="虚构编辑表单">
    <StaffEditorGroup title="基本信息">
      <label>
        标题 <input name="title" required />
      </label>
    </StaffEditorGroup>
    <MobileSaveBar>
      <p role="alert">请填写标题。</p>
      <StaffActionButton type="submit" reason="正在保存。">
        保存草稿
      </StaffActionButton>
    </MobileSaveBar>
  </form>,
);
assert.match(
  html,
  /<section[^>]*class="staff-editor-group"[^>]*aria-labelledby="([^"]+)"[^>]*><h3 id="\1">基本信息<\/h3>/,
);
assert.match(html, /<label>标题 <input required="" name="title"\/><\/label>/);
assert.match(html, /<div class="staff-mobile-save"><p role="alert">请填写标题。<\/p>/);
assert.equal((html.match(/<button/g) ?? []).length, 1);
assert.match(
  html,
  /<button(?=[^>]*type="submit")(?=[^>]*disabled)(?=[^>]*aria-describedby=)[^>]*>保存草稿/,
);
console.log("PASS mobile form labels, error and a single original submit button");
