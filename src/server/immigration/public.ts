import type { Payload } from "payload";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import {
  publicPolicy,
  validatePublicPolicy,
  type PublicPolicyData,
} from "../../lib/immigration-policy";

/** Trusted SSR reader; never return raw collection records or read working policy masters. */
export async function listPublicPolicies(p: Payload, locale: string): Promise<PublicPolicyData[]> {
  if (!visaCheckerEnabled() || (locale !== "en" && locale !== "zh")) return [];
  const snapshots = await p.find({
    collection: "content-published",
    where: { active: { equals: true } },
    pagination: false,
    sort: "id",
    depth: 0,
    overrideAccess: true,
    select: { body: true },
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const result: PublicPolicyData[] = [];
  for (const snapshot of snapshots.docs) {
    const body = snapshot.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) continue;
    if (body.kind !== "immigration-policy" || body.locale !== locale) continue;
    try {
      validatePublicPolicy(body.policy, today);
      result.push(publicPolicy(body.policy));
    } catch {
      // Invalid formal data stays hidden; a malformed row never falls back to a draft.
    }
  }
  return result;
}
