import assert from "node:assert/strict";
import test from "node:test";
import {
  isExhibitionSubscribable,
  validExhibitionSubscriptionRequest,
  type ExhibitionSubscriptionTarget,
} from "../src/lib/exhibition-subscription.ts";

const target: ExhibitionSubscriptionTarget = {
  kind: "exhibition",
  locale: "zh",
  contentKey: "fair-2090",
  slug: "future-fair",
  title: "Fictional fair",
  exhibition: { status: "announced", endDate: "2090-03-03" },
};
const today = "2026-11-26";
for (const [name, body, locale, expected] of [
  ["published upcoming edition", target, "zh", true],
  [
    "end day stays available",
    { ...target, exhibition: { status: "announced", endDate: today } },
    "zh",
    true,
  ],
  [
    "day after end closes",
    { ...target, exhibition: { status: "announced", endDate: "2026-11-25" } },
    "zh",
    false,
  ],
  ["missing target closes", undefined, "zh", false],
  ["another language cannot substitute", target, "en", false],
  ["wrong kind cannot substitute", { ...target, kind: "guide" }, "zh", false],
  ["malformed identifier closes", { ...target, contentKey: "../other" }, "zh", false],
  ["missing exhibition closes", { ...target, exhibition: undefined }, "zh", false],
  [
    "cancelled closes",
    { ...target, exhibition: { status: "cancelled", endDate: "2090-03-03" } },
    "zh",
    false,
  ],
  [
    "explicit ended closes",
    { ...target, exhibition: { status: "ended", endDate: "2090-03-03" } },
    "zh",
    false,
  ],
  [
    "unknown pending stays available",
    { ...target, exhibition: { status: "pending", endDate: "" } },
    "zh",
    true,
  ],
  [
    "past pending keeps original ended rule",
    { ...target, exhibition: { status: "pending", endDate: "2020-03-03" } },
    "zh",
    false,
  ],
  [
    "postponed old date stays postponed",
    { ...target, exhibition: { status: "postponed", endDate: "2020-03-03" } },
    "zh",
    true,
  ],
  ["legacy other-language topic stays supported", { ...target, locale: "fr" }, "fr", true],
] as const) {
  test(`exhibition subscription eligibility: ${name}`, () => {
    assert.equal(isExhibitionSubscribable(body, locale, today), expected);
  });
}

const request = {
  email: "fictional@example.invalid",
  topic: "exhibition:fair-2090",
  exhibitionKey: "fair-2090",
  locale: "zh",
  sourcePath: "/zh/exhibitions/future-fair",
  privacyVersion: "fictional-v1",
  consent: true,
  contactFax: "",
};
test("dedicated contract accepts stable key without mutating input", () => {
  const before = structuredClone(request);
  assert.equal(validExhibitionSubscriptionRequest(request), true);
  assert.deepEqual(request, before);
});
test("legacy requests without dedicated marker keep their original validation path", () => {
  assert.equal(validExhibitionSubscriptionRequest({ topic: "policy-updates" }), true);
  assert.equal(
    validExhibitionSubscriptionRequest({ topic: "exhibition:fair-2090", locale: "fr" }),
    true,
  );
});
for (const [name, change] of [
  ["different topic", { topic: "exhibition:other-fair" }],
  ["general topic", { topic: "exhibition-alerts" }],
  ["null marker", { exhibitionKey: null }],
  ["number marker", { exhibitionKey: 42 }],
  ["empty marker", { exhibitionKey: "" }],
  ["malformed marker", { exhibitionKey: "../other" }],
  ["unsupported dedicated language", { locale: "fr" }],
  ["policy mixture", { policyReference: "a".repeat(64) }],
  ["client title", { title: "Unreviewed title" }],
  ["client status", { status: "announced" }],
] as const) {
  test(`dedicated contract rejects ${name}`, () => {
    assert.equal(validExhibitionSubscriptionRequest({ ...request, ...change }), false);
  });
}
