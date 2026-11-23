import type { readCampaignRevisionPreflight } from "../server/subscription-campaign-revision-preflight";
import { preflightCounts, preflightBlockers } from "./subscription-campaign-revision-preflight.ts";

export type RevisionPreflight = Awaited<ReturnType<typeof readCampaignRevisionPreflight>>;
export async function loadCampaignRevisionPreflight(draft: {
  campaignKey: string;
  revision: number;
}) {
  const fallback = "预检未更新，请稍后重试。";
  let response: Response, result: { error?: string; preflight?: RevisionPreflight } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read-revision-preflight-local",
        input: { campaignKey: draft.campaignKey, revision: draft.revision },
      }),
    });
    result = await response.json();
  } catch {
    throw Error(fallback);
  }
  if (!response.ok) throw Error(typeof result?.error === "string" ? result.error : fallback);
  const data = result?.preflight;
  const keys = (value: object, allowed: string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (
    !data ||
    !keys(data, ["revision", "snapshot", "asOf", "counts", "total", "blockers"]) ||
    data.revision !== draft.revision ||
    !count(data.total) ||
    data.total > 1000 ||
    typeof data.asOf !== "string" ||
    !Number.isFinite(Date.parse(data.asOf)) ||
    new Date(data.asOf).toISOString() !== data.asOf ||
    !data.counts ||
    !keys(data.counts, Object.keys(preflightCounts)) ||
    !Object.keys(preflightCounts).every((key) =>
      count(data.counts[key as keyof typeof preflightCounts]),
    ) ||
    Object.values(data.counts).reduce((a, b) => a + b, 0) !== data.total ||
    (data.snapshot === null
      ? data.total !== 0
      : !data.snapshot ||
        !keys(data.snapshot, ["revision", "current"]) ||
        !count(data.snapshot.revision) ||
        data.snapshot.revision < 1 ||
        data.snapshot.revision > draft.revision ||
        data.snapshot.current !== (data.snapshot.revision === draft.revision)) ||
    !Array.isArray(data.blockers) ||
    new Set(data.blockers).size !== data.blockers.length ||
    !data.blockers.every((key) => typeof key === "string" && Object.hasOwn(preflightBlockers, key))
  )
    throw Error(fallback);
  return data;
}
