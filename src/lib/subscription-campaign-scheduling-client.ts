export type NextMockTask = {
  slotId: number | null;
  nextAttemptAt: string | null;
  asOf: string;
};
export async function requestNextMockSlot(input: { campaignKey: string; revision: number }) {
  const fallback = "自动领取已停止，请核对当前活动后重新开启。";
  let response: Response;
  let body: { error?: string; nextTask?: NextMockTask } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read-next-mock-slot-local", input }),
    });
    body = await response.json();
  } catch {
    throw new Error(fallback);
  }
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : fallback);
  const row = body?.nextTask;
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    (row.slotId !== null && (!Number.isSafeInteger(row.slotId) || row.slotId <= 0)) ||
    (row.nextAttemptAt !== null && !date(row.nextAttemptAt)) ||
    !date(row.asOf)
  )
    throw new Error(fallback);
  return row;
}
