export async function GET() {
  return Response.json(
    {
      schemaVersion: 1,
      endpoint: "/api/public/exhibitions",
      method: "GET",
      authentication: "none",
      description:
        "Read-only published exhibition snapshots. Drafts and internal records are never returned. Exact locale only; no language fallback.",
      parameters: {
        locale: "zh|en|es|fr|de|it|ar (default en)",
        city: "Catalog city code",
        industry: "hardware|electrical|machinery|electronics|building|consumer|other",
        month: "YYYY-MM; includes events overlapping this month",
        q: "Case-insensitive title, summary, edition, venue, address and exhibits search; max 200 characters",
        period: "upcoming (default), past (ended/cancelled), all",
        key: "Public content key; retrieves historical events as well",
        slug: "Locale-specific slug; retrieves historical events as well",
        page: "Positive integer, page size 20",
      },
      status:
        "Derived using Asia/Shanghai calendar day. Cancellation/postponement preserved. Ended/cancelled exhibitions have no inquiryPath.",
      errors: {
        400: "Invalid parameters",
        404: "Key or slug has no publication in requested locale",
        503: "Data temporarily unavailable",
      },
      usage:
        "Use path for details and inquiryPath for enquiries. Verify dates and admission on officialURL; verifiedAt records the last human source check. Related projectKeys do not imply availability.",
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
