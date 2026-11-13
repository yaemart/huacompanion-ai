import { createHash } from "node:crypto";
import type { ServiceEvent, ServiceQuote } from "../../../payload-types";
import { relationID } from "../../cms/access.ts";

export type QuoteConfirmations = { difference: string[]; collection: string[] };

export type QuoteReviewDetail = {
  quote?: number;
  decision?: string;
  quoteRevision?: number;
  quoteFingerprint?: string;
  reviewedAt?: string;
  quoteUpdatedAt?: string;
  selfReview?: boolean;
  confirmations?: QuoteConfirmations;
};

const contractFields = [
  "id",
  "revision",
  "title",
  "scope",
  "included",
  "excluded",
  "terms",
  "currency",
  "lines",
  "totalMinor",
  "expiresAt",
] as const;

export function quoteReviewProof(quote: ServiceQuote) {
  const contract = [...contractFields.map((field) => quote[field]), relationID(quote.createdBy)];
  if (quote.lineFormat === 2) contract.push(quote.lineFormat);
  return {
    quoteRevision: quote.revision,
    quoteFingerprint: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
  };
}

export function confirmsQuoteLines(value: unknown, required: QuoteConfirmations) {
  const submitted = value as Partial<QuoteConfirmations> | null | undefined;
  return (["difference", "collection"] as const).every((kind) => {
    const actual = submitted?.[kind];
    if (actual === undefined) return required[kind].length === 0;
    return (
      Array.isArray(actual) &&
      actual.length === required[kind].length &&
      required[kind].every((id) => actual.includes(id))
    );
  });
}

export function quoteApproval(quote: ServiceQuote, events: ServiceEvent[]) {
  const reviewer = relationID(quote.reviewedBy);
  if (!reviewer || !quote.reviewedAt || !quote.reviewReason?.trim()) return;
  const proof = quoteReviewProof(quote);
  const selfReview = reviewer === relationID(quote.createdBy);
  return events.find((event) => {
    const detail = event.detail as QuoteReviewDetail | null;
    return (
      event.action === "review" &&
      relationID(event.serviceCase) === relationID(quote.serviceCase) &&
      relationID(event.actor) === reviewer &&
      event.reason === quote.reviewReason &&
      detail?.quote === quote.id &&
      detail.decision === "approved" &&
      detail.quoteRevision === proof.quoteRevision &&
      detail.quoteFingerprint === proof.quoteFingerprint &&
      detail.reviewedAt === quote.reviewedAt &&
      detail.quoteUpdatedAt === quote.updatedAt &&
      detail.selfReview === selfReview
    );
  })?.detail as QuoteReviewDetail | undefined;
}

export function quoteReviewState(
  quote: ServiceQuote,
  events: ServiceEvent[],
): NonNullable<ServiceQuote["reviewStatus"]> | "unsubmitted" {
  if (quote.reviewStatus !== "approved" || quote.status !== "draft")
    return quote.reviewStatus ?? "unsubmitted";
  return quoteApproval(quote, events) ? "approved" : "unsubmitted";
}
