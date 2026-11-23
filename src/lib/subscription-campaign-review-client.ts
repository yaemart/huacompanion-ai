import type { readCampaignReviewDetails } from "../server/subscription-campaign-review";
import { reviewReasons, reviewOutcomes, reviewEvents } from "./subscription-campaign-review.ts";

type Details = Awaited<ReturnType<typeof readCampaignReviewDetails>>;
export async function loadCampaignReviewDetails(
  draft: { campaignKey: string; revision: number },
  page: number,
): Promise<Details> {
  const fallback = "明细未更新，请稍后重试。";
  let response: Response, result: { error?: string; reviewDetails?: Details } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read-mock-review-local",
        input: { campaignKey: draft.campaignKey, revision: draft.revision, page },
      }),
    });
    result = await response.json();
  } catch {
    throw Error(fallback);
  }
  if (!response.ok) throw Error(typeof result?.error === "string" ? result.error : fallback);
  const data = result?.reviewDetails;
  const date = (value: unknown) =>
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const keys = (value: object, allowed: string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  if (
    !data ||
    !keys(data, ["snapshot", "asOf", "page", "total", "rows"]) ||
    !date(data.asOf) ||
    data.page !== page ||
    !count(page) ||
    page < 1 ||
    page > 40 ||
    !count(data.total) ||
    data.total > 1000 ||
    !Array.isArray(data.rows) ||
    data.rows.length !== Math.min(25, Math.max(0, data.total - (page - 1) * 25)) ||
    (data.snapshot === null
      ? data.total !== 0
      : !data.snapshot ||
        !keys(data.snapshot, ["revision", "current"]) ||
        !count(data.snapshot.revision) ||
        data.snapshot.revision < 1 ||
        typeof data.snapshot.current !== "boolean" ||
        data.snapshot.revision > draft.revision ||
        data.snapshot.current !== (data.snapshot.revision === draft.revision)) ||
    !data.rows.every(
      (row, index) =>
        row &&
        keys(row, ["slotId", "attemptedAt", "lastOutcome", "reason", "events", "hasOlderEvents"]) &&
        count(row.slotId) &&
        row.slotId > (data.rows[index - 1]?.slotId ?? 0) &&
        Array.isArray(row.attemptedAt) &&
        row.attemptedAt.length > 0 &&
        row.attemptedAt.length <= 5 &&
        row.attemptedAt.every(date) &&
        (row.lastOutcome === null ||
          (typeof row.lastOutcome === "string" &&
            Object.hasOwn(reviewOutcomes, row.lastOutcome))) &&
        typeof row.reason === "string" &&
        Object.hasOwn(reviewReasons, row.reason) &&
        typeof row.hasOlderEvents === "boolean" &&
        Array.isArray(row.events) &&
        row.events.length <= 20 &&
        row.events.every(
          (event) =>
            event &&
            keys(event, ["action", "at"]) &&
            typeof event.action === "string" &&
            Object.hasOwn(reviewEvents, event.action) &&
            date(event.at),
        ),
    )
  )
    throw Error(fallback);
  return data;
}
