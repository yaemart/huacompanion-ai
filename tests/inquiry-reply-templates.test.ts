import assert from "node:assert/strict";
import test from "node:test";
import { replyTemplateBody } from "../src/lib/inquiry-reply-templates.ts";

test("use the explicitly selected language and preserve paragraph breaks", () => {
  const template = {
    bodyZh: "您好！\n\n请提供行程。",
    bodyEn: "Hello!\n\nPlease share your itinerary.",
  };
  assert.equal(replyTemplateBody(template, "en"), "Hello!\n\nPlease share your itinerary.");
  assert.equal(replyTemplateBody(template, "zh"), "您好！\n\n请提供行程。");
});
