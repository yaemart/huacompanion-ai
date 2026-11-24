import type { Payload } from "payload";
import { observePGQueries } from "./observe-pg-queries";

export function observeCampaignAudience<T>(p: Payload, run: () => Promise<T>) {
  return observePGQueries(p, run, (text) => /\bFROM\s+"?subscriptions\b/i.test(text));
}
