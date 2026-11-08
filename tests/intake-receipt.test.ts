import assert from "node:assert/strict";
import test from "node:test";
import { defaultInquiryReplies, publicInquiryReplies } from "../src/lib/intake-receipt.ts";

test("inquiry receipt defaults use the approved exact wording", () => {
  assert.deepEqual(defaultInquiryReplies, {
    zh: "我们会在 1 个工作日内（北京时间）通过邮件回复您。",
    en: "We will reply by email within 1 business day (Beijing time).",
  });
  for (const value of [undefined, null, [], false, "invalid"])
    assert.deepEqual(publicInquiryReplies(value), defaultInquiryReplies);
});
test("each reply language falls back independently and only public strings escape", () => {
  assert.deepEqual(
    publicInquiryReplies({
      inquiryReplyZh: " 中文承诺 ",
      inquiryReplyEn: " ",
      emailEnabled: true,
      enabledEvents: ["private-event"],
      private: "never expose",
    }),
    { zh: "中文承诺", en: defaultInquiryReplies.en },
  );
  assert.deepEqual(publicInquiryReplies({ inquiryReplyEn: "New reply", inquiryReplyZh: null }), {
    zh: defaultInquiryReplies.zh,
    en: "New reply",
  });
  assert.deepEqual(
    publicInquiryReplies({ inquiryReplyZh: 42, inquiryReplyEn: "x".repeat(501) }),
    defaultInquiryReplies,
  );
});
