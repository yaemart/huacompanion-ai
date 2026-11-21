import type { readCampaignTaskStatus } from "../server/subscription-campaign-status";

type Status = Awaited<ReturnType<typeof readCampaignTaskStatus>>;
export async function loadCampaignTaskStatus(draft: {
  campaignKey: string;
  revision: number;
}): Promise<Status> {
  const fallback = "统计未更新，请稍后重试。";
  let response: Response;
  let result: { error?: string; taskStatus?: Status } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read-mock-status-local",
        input: { campaignKey: draft.campaignKey, revision: draft.revision },
      }),
    });
    result = await response.json();
  } catch {
    throw Error(fallback);
  }
  if (!response.ok) throw Error(typeof result?.error === "string" ? result.error : fallback);
  const status = result?.taskStatus;
  const keys = [
    "unreserved",
    "ready",
    "leased",
    "attempting",
    "retryWaiting",
    "retryReady",
    "review",
    "failed",
    "completed",
    "cancelled",
  ] as const;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (
    !status ||
    !status.counts ||
    !keys.every((key) => count(status.counts[key])) ||
    !count(status.total) ||
    keys.reduce((sum, key) => sum + status.counts[key], 0) !== status.total ||
    !count(status.attempts) ||
    !date(status.asOf) ||
    (status.nextAttemptAt !== null && !date(status.nextAttemptAt)) ||
    (status.snapshot !== null &&
      (!status.snapshot ||
        !count(status.snapshot.revision) ||
        status.snapshot.revision < 1 ||
        typeof status.snapshot.current !== "boolean"))
  )
    throw Error(fallback);
  return status;
}
