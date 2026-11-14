import type { Payload, PayloadRequest } from "payload";
import type { PublicCompanySetting, ServiceEvent, ServiceQuote } from "../../../payload-types";
import {
  quoteLinesView,
  quoteNoticeDefaults,
  quotePartiesDiffer,
  type QuoteNoticeKey,
} from "../../lib/quote-lines";
import { quoteReviewState } from "./quote-review";

export function readQuoteNoticeSettings(p: Payload, req?: Partial<PayloadRequest>) {
  return p.findGlobal({
    slug: "public-company-settings",
    select: { quoteReferralNotice: true, quoteManagedNotice: true, quoteCollectionNotice: true },
    req,
  });
}

export type QuoteNoticeSettings = Pick<PublicCompanySetting, QuoteNoticeKey>;

type NoticeLines = Pick<ServiceQuote, "lines" | "lineFormat">;

export function quoteLinesWithNotices(quote: NoticeLines, settings: QuoteNoticeSettings) {
  const text = (key: QuoteNoticeKey) => settings[key]?.trim() || quoteNoticeDefaults[key];
  return quoteLinesView(quote.lines, quote.lineFormat, true).map((line) => {
    if (line.collection)
      return { ...line, collectionNotice: text("quoteCollectionNotice"), customerNotice: null };
    // The standard referral copy says the provider collects the payment.
    const separatePayee =
      (line.payeeProviderId !== undefined && line.payeeProviderId !== line.providerId) ||
      quotePartiesDiffer(line.serviceName ?? "", line.payeeName ?? "");
    const key = line.mode === "managed" ? "quoteManagedNotice" : "quoteReferralNotice";
    return { ...line, customerNotice: separatePayee ? null : text(key) };
  });
}

export function quoteNoticesCurrent(quote: NoticeLines, settings: QuoteNoticeSettings) {
  if (!Array.isArray(quote.lines)) return false;
  const saved = quote.lines as { customerNotice?: string | null; collectionNotice?: string }[];
  const lines = quoteLinesWithNotices(quote, settings);
  return (
    lines.length === saved.length &&
    lines.every(
      ({ customerNotice, collectionNotice }, index) =>
        customerNotice === saved[index].customerNotice &&
        collectionNotice === saved[index].collectionNotice,
    )
  );
}

export function quoteReviewWithNotices(
  quote: ServiceQuote,
  events: ServiceEvent[],
  settings: QuoteNoticeSettings,
) {
  const state = quoteReviewState(quote, events);
  const needsResubmission =
    quote.status === "draft" &&
    quote.lineFormat === 2 &&
    (state === "pending" || state === "approved") &&
    !quoteNoticesCurrent(quote, settings);
  return { state: needsResubmission ? ("unsubmitted" as const) : state, needsResubmission };
}
