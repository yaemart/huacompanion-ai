import { createHash } from "node:crypto";
import type { ServiceEvent, ServiceQuote } from "../../../payload-types";
import { relationID } from "../../cms/access.ts";

export type QuoteReviewDetail = {
  quote?: number;
  decision?: string;
  quoteRevision?: number;
  quoteFingerprint?: string;
  reviewedAt?: string;
  quoteUpdatedAt?: string;
  selfReview?: boolean;
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
  return {
    quoteRevision: quote.revision,
    quoteFingerprint: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
  };
}

export function quoteReviewState(
  quote: ServiceQuote,
  events: ServiceEvent[],
): NonNullable<ServiceQuote["reviewStatus"]> | "unsubmitted" {
  if (quote.reviewStatus !== "approved" || quote.status !== "draft")
    return quote.reviewStatus ?? "unsubmitted";
  const reviewer = relationID(quote.reviewedBy);
  if (!reviewer || !quote.reviewedAt || !quote.reviewReason?.trim()) return "unsubmitted";
  const proof = quoteReviewProof(quote);
  const selfReview = reviewer === relationID(quote.createdBy);
  return events.some((event) => {
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
  })
    ? "approved"
    : "unsubmitted";
}
