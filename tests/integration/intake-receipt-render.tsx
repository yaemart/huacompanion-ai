import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InquiryReceipt } from "../../src/components/InquiryReceipt";
import { SiteProvider } from "../../src/components/SiteContext";
import { defaultInquiryReplies } from "../../src/lib/intake-receipt";

for (const locale of ["en", "zh"] as const) {
  assert.equal(
    renderToStaticMarkup(<InquiryReceipt locale={locale} kind="request" reference="" />),
    "",
  );
  const html = renderToStaticMarkup(
    <InquiryReceipt locale={locale} kind="request" reference="HC-Q-TEST" />,
  );
  assert.ok(html.includes(defaultInquiryReplies[locale]));
  assert.match(html, /HC-Q-TEST/);
  assert.match(html, /role="status"/);
  assert.match(html, locale === "zh" ? /未发送确认邮件/ : /No confirmation email has been sent/);
  const provider = renderToStaticMarkup(
    <InquiryReceipt locale={locale} kind="apply" reference="HC-P-TEST" />,
  );
  assert.doesNotMatch(provider, /data-inquiry-reply/);
}
const custom = renderToStaticMarkup(
  <SiteProvider
    value={{
      activeLocales: ["en", "zh"],
      features: { customerCenter: false, textChat: false },
      inquiryReplies: { en: "<script>custom</script>", zh: "自定义承诺" },
    }}
  >
    <InquiryReceipt locale="en" kind="request" reference="HC-Q-CUSTOM" />
  </SiteProvider>,
);
assert.match(custom, /&lt;script&gt;custom&lt;\/script&gt;/);
assert.doesNotMatch(custom, /<script>/);
assert.match(custom, /overflow-wrap:anywhere/);
console.log(
  "PASS receipt exact default/custom copy, saved-only, provider exclusion, escaping and local mail notice",
);
