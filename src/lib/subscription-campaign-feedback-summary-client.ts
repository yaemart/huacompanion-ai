import type { readCampaignFeedbackSummary } from "../server/subscription-campaign-feedback-summary";

export type FeedbackSummary = Awaited<ReturnType<typeof readCampaignFeedbackSummary>>;
export async function loadCampaignFeedbackSummary(draft: {
  campaignKey: string;
  revision: number;
}): Promise<FeedbackSummary> {
  const fallback = "回执汇总未更新，请稍后重试。";
  let response: Response, result: { error?: string; feedbackSummary?: FeedbackSummary } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read-feedback-summary-local",
        input: { campaignKey: draft.campaignKey, revision: draft.revision },
      }),
    });
    result = await response.json();
  } catch {
    throw Error(fallback);
  }
  if (!response.ok) throw Error(typeof result?.error === "string" ? result.error : fallback);
  const summary = result?.feedbackSummary;
  const count = (v: unknown): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  if (
    !summary ||
    !count(summary.total) ||
    !summary.counts ||
    !(["delivered", "hardBounce", "complaint", "providerSuppressed", "suppressed"] as const).every(
      (key) => count(summary.counts[key]) && summary.counts[key] <= summary.total,
    ) ||
    typeof summary.asOf !== "string" ||
    !Number.isFinite(Date.parse(summary.asOf)) ||
    new Date(summary.asOf).toISOString() !== summary.asOf ||
    (summary.snapshot === null
      ? summary.total !== 0
      : !summary.snapshot ||
        !count(summary.snapshot.revision) ||
        summary.snapshot.revision < 1 ||
        typeof summary.snapshot.current !== "boolean" ||
        (summary.snapshot.current
          ? summary.snapshot.revision !== draft.revision
          : summary.snapshot.revision >= draft.revision))
  )
    throw Error(fallback);
  return summary;
}
