import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceEvent, ServiceQuote } from "../payload-types";
import { quoteReviewProof, quoteReviewState } from "../src/server/business/quote-review.ts";

const at = "2026-11-12T09:00:00.000Z";
const quote: ServiceQuote = {
  id: 41,
  serviceCase: 5,
  revision: 3,
  dedupe: "draft",
  status: "draft",
  title: "Fictional offer",
  scope: "Site visit",
  included: "Interpreter",
  excluded: "Transport",
  terms: "Availability confirmed separately",
  currency: "CNY",
  lines: [{ label: "Visit", quantity: 1, unitMinor: 50000 }],
  totalMinor: 50000,
  expiresAt: "2026-11-21T09:00:00.000Z",
  createdBy: 11,
  reviewStatus: "approved",
  reviewedBy: 12,
  reviewReason: "Verified scope and price",
  reviewedAt: at,
  createdAt: at,
  updatedAt: at,
};
const approval: ServiceEvent = {
  id: 4,
  serviceCase: 5,
  dedupe: "review",
  action: "review",
  actor: 12,
  reason: quote.reviewReason,
  detail: {
    ...quoteReviewProof(quote),
    quote: 41,
    decision: "approved",
    reviewedAt: at,
    quoteUpdatedAt: at,
    selfReview: false,
  },
  createdAt: at,
  updatedAt: at,
};

test("a draft approval applies to its reviewed quote revision, content and reviewer only", () => {
  assert.equal(quoteReviewState(quote, [approval]), "approved");
  for (const changed of [
    { id: 42 },
    { revision: 4 },
    { totalMinor: 48000 },
    { terms: "Different terms" },
    { lines: [{ label: "Visit", quantity: 1, unitMinor: 48000 }] },
    { createdBy: 12 },
    { reviewedBy: 13 },
    { updatedAt: "2026-11-12T10:00:00.000Z" },
  ])
    assert.equal(quoteReviewState({ ...quote, ...changed }, [approval]), "unsubmitted");
});

test("legacy approval metadata needs a fresh review for drafts and remains visible in sent history", () => {
  assert.equal(quoteReviewState(quote, []), "unsubmitted");
  assert.equal(quoteReviewState({ ...quote, status: "sent" }, []), "approved");
});
