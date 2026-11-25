import { MockTaskRequestError } from "./subscription-campaign-task-client.ts";

export type ContinuationReceipt = {
  campaignKey: string;
  revision: number;
  originalRevision: number;
  bound: number;
  continuedAt: string;
  replayed: boolean;
};
type Draft = { campaignKey: string; revision: number };
const fallback = "续发结果待核实，请先只读核实本版收据。";
export function parseContinuationReceipt(value: unknown, draft: Draft): ContinuationReceipt {
  const data = value as ContinuationReceipt | null;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).some(
      (key) =>
        ![
          "campaignKey",
          "revision",
          "originalRevision",
          "bound",
          "continuedAt",
          "replayed",
        ].includes(key),
    ) ||
    data.campaignKey !== draft.campaignKey ||
    data.revision !== draft.revision ||
    !Number.isSafeInteger(data.originalRevision) ||
    data.originalRevision < 1 ||
    data.originalRevision >= draft.revision ||
    !Number.isSafeInteger(data.bound) ||
    data.bound < 1 ||
    data.bound > 1000 ||
    typeof data.replayed !== "boolean" ||
    typeof data.continuedAt !== "string" ||
    !Number.isFinite(Date.parse(data.continuedAt)) ||
    new Date(data.continuedAt).toISOString() !== data.continuedAt
  )
    throw new MockTaskRequestError(fallback, true);
  return data;
}
export async function continuationRequest(draft: Draft, readOnly = false) {
  let response: Response, body: { error?: string; continuation?: unknown } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: readOnly ? "read-continuation-local" : "continue-revision-local",
        input: {
          campaignKey: draft.campaignKey,
          revision: draft.revision,
          ...(readOnly ? {} : { confirmed: true }),
        },
      }),
    });
    body = await response.json();
  } catch {
    throw new MockTaskRequestError(fallback, true);
  }
  if (!response.ok)
    throw new MockTaskRequestError(
      typeof body?.error === "string" ? body.error : fallback,
      response.status >= 500,
    );
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "continuation")
  )
    throw new MockTaskRequestError(fallback, true);
  return readOnly && body.continuation === null
    ? null
    : parseContinuationReceipt(body.continuation, draft);
}
