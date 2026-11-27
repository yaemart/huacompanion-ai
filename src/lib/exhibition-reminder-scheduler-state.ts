import { isContentIdentifier } from "./content-identifiers.ts";
import type { ReminderScope } from "./exhibition-reminders.ts";
export type SchedulerState = {
  version: 1;
  runId: string | null;
  owner: number | null;
  targets: ReminderScope[];
  pending: null | { digest: string; scope: ReminderScope };
};
export type SchedulerLedger = { revision: number; state: SchedulerState };
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === keys.join();
const scope = (v: unknown): v is ReminderScope =>
  exact(v, ["key", "locale"]) &&
  isContentIdentifier(v.key) &&
  (v.locale === "zh" || v.locale === "en");
const key = (s: ReminderScope) => JSON.stringify([s.key, s.locale]);
export function parseSchedulerLedger(value: unknown): SchedulerLedger {
  if (
    exact(value, ["revision", "state"]) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0
  ) {
    const s = value.state;
    if (
      exact(s, ["owner", "pending", "runId", "targets", "version"]) &&
      s.version === 1 &&
      Array.isArray(s.targets)
    ) {
      const idle =
        s.runId === null && s.owner === null && s.targets.length === 0 && s.pending === null;
      const tokens = s.targets.every(scope) ? s.targets.map(key) : [];
      const pending = s.pending;
      const validPending =
        pending === null ||
        (exact(pending, ["digest", "scope"]) &&
          typeof pending.digest === "string" &&
          /^[a-f0-9]{64}$/.test(pending.digest) &&
          scope(pending.scope) &&
          tokens.includes(key(pending.scope)));
      const active =
        Number(value.revision) > 0 &&
        typeof s.runId === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s.runId) &&
        Number.isSafeInteger(s.owner) &&
        Number(s.owner) > 0 &&
        tokens.length === s.targets.length &&
        tokens.length > 0 &&
        tokens.length <= 20 &&
        tokens.every((t, i) => i === 0 || tokens[i - 1] < t) &&
        validPending;
      if (idle || active) return value as unknown as SchedulerLedger;
    }
  }
  throw Error("调度控制状态无效，请核实持久审计。");
}
