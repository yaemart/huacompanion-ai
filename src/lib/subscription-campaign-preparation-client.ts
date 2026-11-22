import type {
  readMockCampaignBudget,
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../server/subscription-campaign-quota";
import { MockTaskRequestError } from "./subscription-campaign-task-client.ts";

export type BudgetSnapshot = Awaited<ReturnType<typeof readMockCampaignBudget>>;
export type PreparationCommand = {
  action: "read-mock-budget-local" | "set-mock-budget-local" | "reserve-mock-slot-local";
  input: Record<string, string | number>;
};
export function preparationRecovery(command: PreparationCommand): PreparationCommand {
  return command.action === "reserve-mock-slot-local"
    ? command
    : { action: "read-mock-budget-local", input: {} };
}
export async function preparationRequest(command: PreparationCommand) {
  const fallback = "准备操作结果待核实，请先核实后继续。";
  const fail = () => new MockTaskRequestError(fallback, true);
  let response: Response;
  let body: Record<string, unknown> | null;
  try {
    response = await fetch("/api/subscriptions/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    body = await response.json();
  } catch {
    throw fail();
  }
  if (!response.ok)
    throw new MockTaskRequestError(
      typeof body?.error === "string" ? body.error : fallback,
      response.status >= 500,
    );
  const record = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const natural = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const amount = (value: unknown) => natural(value) && value <= 2000;
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (command.action === "reserve-mock-slot-local") {
    const value = record(body?.reservation);
    if (
      !value ||
      typeof value.state !== "string" ||
      ![
        "reserved-local",
        "already-reserved",
        "budget-unavailable",
        "budget-exhausted",
        "daily-limit",
        "email-limit",
        "no-candidate",
        "ineligible",
      ].includes(value.state) ||
      (["reserved-local", "already-reserved"].includes(value.state) &&
        (!natural(value.id) || value.id === 0))
    )
      throw fail();
    return {
      kind: "reserve" as const,
      reservation: value as unknown as Awaited<ReturnType<typeof reserveMockCampaignSlot>>,
    };
  }
  const value = record(body?.budget);
  if (!value) throw fail();
  if (command.action === "set-mock-budget-local") {
    if (!natural(value.id) || value.id === 0 || !amount(value.remaining) || !date(value.expiresAt))
      throw fail();
    return {
      kind: "set" as const,
      budget: value as unknown as Awaited<ReturnType<typeof setMockCampaignBudget>>,
    };
  }
  if (
    typeof value.valid !== "boolean" ||
    !date(value.asOf) ||
    (value.id === null
      ? value.configured !== null || value.expiresAt !== null || value.reason !== null
      : !natural(value.id) ||
        value.id === 0 ||
        !amount(value.configured) ||
        !date(value.expiresAt) ||
        typeof value.reason !== "string") ||
    (value.valid ? value.id === null || !amount(value.remaining) : value.remaining !== null)
  )
    throw fail();
  return { kind: "read" as const, budget: value as unknown as BudgetSnapshot };
}
