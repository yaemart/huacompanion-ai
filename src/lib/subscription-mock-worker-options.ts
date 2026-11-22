export type MockWorkerOptions = Readonly<{
  staffId: number;
  campaignKey: string;
  revision: number;
  outcome: "accepted" | "temporary" | "rate-limited" | "unknown" | "permanent";
  retryAfterMs?: number;
  once: boolean;
}>;
export class MockWorkerInputError extends Error {}
const invalid = () => new MockWorkerInputError("请指定有效主管、活动、版本及本地模拟结果。");
export function requireLocalMockWorker(env: Record<string, string | undefined> = process.env) {
  if (env.APP_ENV !== "local") throw new MockWorkerInputError("仅支持本地模拟 worker。");
}
export function mockWorkerOptions(value: unknown): MockWorkerOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  const allowed = ["staffId", "campaignKey", "revision", "outcome", "retryAfterMs", "once"];
  const positive = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  const outcome = row.outcome === undefined ? "accepted" : row.outcome;
  if (
    Object.keys(row).some((key) => !allowed.includes(key)) ||
    !positive(row.staffId) ||
    !positive(row.revision) ||
    typeof row.campaignKey !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      row.campaignKey,
    ) ||
    typeof outcome !== "string" ||
    !["accepted", "temporary", "rate-limited", "unknown", "permanent"].includes(outcome) ||
    (row.once !== undefined && typeof row.once !== "boolean") ||
    (row.retryAfterMs !== undefined &&
      (outcome !== "rate-limited" ||
        typeof row.retryAfterMs !== "number" ||
        !Number.isSafeInteger(row.retryAfterMs) ||
        row.retryAfterMs < 0))
  )
    throw invalid();
  return Object.freeze({
    staffId: row.staffId as number,
    campaignKey: row.campaignKey,
    revision: row.revision as number,
    outcome: outcome as MockWorkerOptions["outcome"],
    ...(row.retryAfterMs === undefined ? {} : { retryAfterMs: row.retryAfterMs as number }),
    once: row.once === true,
  });
}
export function parseMockWorkerArgs(args: string[]) {
  const flags: Record<string, string> = {
    "--staff": "staffId",
    "--campaign": "campaignKey",
    "--revision": "revision",
    "--outcome": "outcome",
    "--retry-after-ms": "retryAfterMs",
    "--once": "once",
  };
  const values: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const field = flags[args[i]];
    if (!field || field in values) throw invalid();
    if (field === "once") {
      values.once = true;
      continue;
    }
    const raw = args[++i];
    if (!raw || raw.startsWith("--")) throw invalid();
    if (["staffId", "revision", "retryAfterMs"].includes(field)) {
      if (!/^\d+$/.test(raw)) throw invalid();
      values[field] = Number(raw);
    } else values[field] = raw;
  }
  return mockWorkerOptions(values);
}
