import { serviceSlugs } from "@/lib/routes";
export async function GET() {
  return Response.json(
    {
      schemaVersion: 1,
      title: "Hua Companion public service catalog",
      mode: "read-only",
      endpoints: {
        catalog: "/api/public/catalog",
        content: "/api/public/content",
        sitemap: "/sitemap.xml",
      },
      query: {
        locale: { values: ["zh", "en"], default: "en" },
        kind: { values: ["provider-profile", "service-project"] },
        key: "Stable public contentKey; combines with kind and locale for a single record",
        category: { values: serviceSlugs },
        city: "Exact city code, such as shanghai",
        language: "Exact service language code, such as en",
        q: "Title, summary or capabilities substring, max 200 characters",
        page: "Positive integer; 20 records per page",
      },
      response: {
        schemaVersion: "Contract version",
        total: "Number matching current filters",
        items:
          "Only currently eligible published snapshots; no language fallback",
      },
      fields: {
        contentKey: "Stable public identifier shared across translations",
        path: "Canonical relative page link",
        publishedAt: "Timestamp of the published version",
        catalog: {
          categories: "Stable service category codes",
          cities: "Objects with stable code and localized name",
          languages: "Language codes",
          verification:
            "Specific checked items and dates only; not an outcome guarantee",
          price: {
            mode: ["quote", "fixed", "from"],
            amount: "Positive number only for fixed/from; omitted for quote",
            currency: "Three-letter currency code",
            unit: "Billing unit; prices with different units are not directly comparable",
            conditions: "Conditions governing the displayed amount",
          },
          fulfillment:
            "arranged: Hua confirms provider after enquiry; specified: named required providers",
          providerKeys:
            "Currently visible public provider identifiers, never private IDs",
          guideKeys:
            "Associated knowledge article contentKey values; resolve against published content in this locale",
        },
        acceptingInquiries:
          "Whether this arrangement currently accepts an enquiry, NOT live availability",
        inquiryPath: "Prefilled Hua form for user review; null when paused",
      },
      unknowns:
        "Missing or omitted information is unknown, never zero price, available inventory or a promise.",
      actions:
        "Open inquiryPath, review the selected service and information with the customer, and let the customer confirm submission. No standalone agent submission or order API is offered. All contact is handled by Hua; no provider direct-contact route.",
      errors: {
        400: "Invalid filters",
        404: "Requested published key absent or withdrawn",
        503: "Temporarily unavailable; do not treat as an empty catalog",
      },
      examples: [
        "/api/public/catalog?locale=en&kind=service-project&category=business",
        "/api/public/catalog?locale=zh&kind=provider-profile&city=shanghai",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
