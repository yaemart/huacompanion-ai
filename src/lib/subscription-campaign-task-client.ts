import type { claimMockCampaignTask } from "../server/subscription-campaign-leases";

export type TaskAction =
  "claim-mock-task-local" | "begin-mock-attempt-local" | "record-mock-result-local";
export type TaskCommand = {
  action: TaskAction;
  input: {
    campaignKey: string;
    revision: number;
    slotId: number;
    token?: string;
    outcome?: string;
    retryAfterMs?: number;
  };
};
type Receipt = Awaited<ReturnType<typeof claimMockCampaignTask>>;
export type LocalLease = {
  slotId: number;
  token: string;
  expiresAt: string;
  phase: "claimed" | "attempting";
};
export class MockTaskRequestError extends Error {
  uncertain: boolean;
  constructor(message: string, uncertain: boolean) {
    super(message);
    this.uncertain = uncertain;
  }
}
export async function requestMockTask(command: TaskCommand): Promise<Receipt> {
  const fallback = "模拟操作结果待核实，请核实本次操作后再继续。";
  let response: Response;
  let body: { error?: string; task?: Receipt } | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
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
  const task = body?.task;
  if (!task || typeof task !== "object" || Array.isArray(task))
    throw new MockTaskRequestError(fallback, true);
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  const valid =
    task?.state === "claimed-local"
      ? command.action === "claim-mock-task-local" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(task.token) &&
        date(task.expiresAt)
      : task && "attempts" in task
        ? [
            "attempting-local",
            "retry-local",
            "review-local",
            "failed-local",
            "completed-local",
          ].includes(task.state) &&
          Number.isSafeInteger(task.attempts) &&
          task.attempts >= 1 &&
          task.attempts <= 5 &&
          typeof task.started === "boolean" &&
          (task.state === "retry-local" ? date(task.nextAttemptAt) : task.nextAttemptAt === null)
        : task && ["busy", "completed-local", "ineligible"].includes(task.state);
  if (
    !task ||
    !valid ||
    (task.state === "busy" && command.action !== "claim-mock-task-local") ||
    (task.state === "attempting-local" && command.action === "record-mock-result-local")
  )
    throw new MockTaskRequestError(fallback, true);
  return task;
}
export function taskLeaseAfter(
  lease: LocalLease | undefined,
  slotId: number,
  action: TaskAction,
  receipt: Receipt,
): LocalLease | undefined {
  if (action === "claim-mock-task-local" && receipt.state === "claimed-local")
    return { slotId, token: receipt.token, expiresAt: receipt.expiresAt, phase: "claimed" };
  if (
    action === "begin-mock-attempt-local" &&
    receipt.state === "attempting-local" &&
    lease?.slotId === slotId
  )
    return { ...lease, phase: "attempting" };
}
