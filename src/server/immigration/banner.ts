import type { Payload, PayloadRequest } from "payload";
import { contentTransaction } from "../content/service";
import { sharedPolicyBanner } from "./shared-banner";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags.ts";
import { parsePolicyBannerBlock, derivePolicyBanner } from "../../lib/immigration-policy-banner.ts";

/** Trusted SSR only: compare formal snapshot with prior publish audit, never draft/master data. */
export async function readPolicyBanner(p: Payload, block: unknown, locale: string, asOf: string) {
  const ref = parsePolicyBannerBlock(block);
  if (!visaCheckerEnabled() || !["en", "zh"].includes(locale) || !ref) return null;
  return contentTransaction(p, async (req) => {
    const shared = await sharedPolicyBanner(p, req, ref.key, asOf, ref.unconfirmed);
    return shared === undefined ? legacyBanner(p, ref, locale, asOf, req) : shared;
  });
}
async function legacyBanner(
  p: Payload,
  ref: NonNullable<ReturnType<typeof parsePolicyBannerBlock>>,
  locale: string,
  asOf: string,
  req: Partial<PayloadRequest>,
) {
  const rows = await p.find({
    collection: "content-published",
    req,
    where: { active: { equals: true } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { body: true, draftId: true, revision: true },
  });
  const matches = rows.docs.filter(
    ({ body }) =>
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      body.kind === "immigration-policy" &&
      body.locale === locale &&
      body.contentKey === ref.key,
  );
  if (matches.length !== 1) return derivePolicyBanner(null, null, asOf);
  const row = matches[0];
  const body = row.body as Record<string, unknown>;
  const current = derivePolicyBanner(body.policy, null, asOf, ref.unconfirmed);
  if (current) return current;
  const events = await p.find({
    collection: "content-events",
    req,
    depth: 0,
    overrideAccess: true,
    limit: 1,
    sort: "-revision",
    where: {
      and: [
        { draftId: { equals: row.draftId } },
        { action: { equals: "publish" } },
        { revision: { less_than: row.revision } },
      ],
    },
    select: { snapshot: true },
  });
  const previous = events.docs[0]?.snapshot;
  const valid =
    previous &&
    typeof previous === "object" &&
    !Array.isArray(previous) &&
    previous.kind === "immigration-policy" &&
    previous.locale === locale &&
    previous.contentKey === ref.key;
  return derivePolicyBanner(body.policy, valid ? previous.policy : null, asOf);
}
