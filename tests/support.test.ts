import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMessage,
  publicMessage,
  publicConversation,
  canDeliver,
  supportText,
} from "../src/lib/support.ts";
test("support rejects empty/oversized text and strips private fields", () => {
  assert.throws(() => validateMessage("  "));
  assert.throws(() => validateMessage("a".repeat(4001)));
  assert.equal(validateMessage(" Hi "), "Hi");
  assert.deepEqual(
    publicMessage({ id: 1, text: "hello", author: "staff", visibility: "internal", secret: "x" }),
    null,
  );
  assert.equal(
    "visitorHash" in publicConversation({ id: 1, visitorHash: "secret", summary: "private" }),
    false,
  );
});
test("late AI output cannot cross handover or message revisions", () => {
  assert.equal(canDeliver({ mode: "ai", revision: 2, aiConsent: true }, { revision: 2 }), true);
  assert.equal(canDeliver({ mode: "human", revision: 2, aiConsent: true }, { revision: 2 }), false);
  assert.equal(canDeliver({ mode: "ai", revision: 3, aiConsent: true }, { revision: 2 }), false);
});
test("seven languages have support entry and consent copy", () => {
  for (const l of ["zh", "en", "es", "fr", "de", "it", "ar"]) {
    assert.notEqual(supportText(l, "title"), "title");
    assert.notEqual(supportText(l, "consent"), "consent");
  }
});
import { validateSupportDraft } from "../src/lib/support.ts";
test("AI request suggestions exclude identity, consent and private address", () => {
  assert.deepEqual(validateSupportDraft({ homeDistrict: "Pudong", homeService: "regular" }), {
    homeDistrict: "Pudong",
    homeService: "regular",
  });
  assert.throws(() => validateSupportDraft({ consent: true }));
  assert.throws(() => validateSupportDraft({ fullAddress: "secret" }));
  assert.throws(() => validateSupportDraft({ email: "x@example.invalid" }));
});
