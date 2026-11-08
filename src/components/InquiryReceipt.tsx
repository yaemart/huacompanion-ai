"use client";
import type { Locale } from "@/lib/locales";
import type { FormKind } from "@/lib/forms";
import { formText } from "@/lib/form-copy";
import { defaultInquiryReplies } from "@/lib/intake-receipt";
import { useSiteConfig } from "./SiteContext";

export function InquiryReceipt({
  locale,
  kind,
  reference,
}: {
  locale: Locale;
  kind: FormKind;
  reference: string;
}) {
  const { inquiryReplies = defaultInquiryReplies } = useSiteConfig();
  if (!reference) return null;
  return (
    <div className="preview-result" role="status">
      <b>{formText(locale, "Saved to the local test database.")}</b>
      <p>
        {formText(locale, "Reference: ")}
        {reference}
      </p>
      {kind === "request" && (
        <p data-inquiry-reply style={{ overflowWrap: "anywhere" }}>
          {inquiryReplies[locale === "zh" ? "zh" : "en"]}
        </p>
      )}
      <p>{formText(locale, "Email is not configured. No confirmation email has been sent.")}</p>
    </div>
  );
}
