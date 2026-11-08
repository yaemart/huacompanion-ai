import type { Payload, PayloadRequest } from "payload";
import { relationID } from "../../cms/access";
import { publicSharedFacts, validateSharedFacts } from "../../lib/policy-shared-facts";
import { approvedSharedNote } from "../../lib/policy-shared-notes";
import { policyTestCountriesAllowed } from "../../lib/immigration-policy-entry";
import type { PublicPolicyData } from "../../lib/immigration-policy";
/** Internal reader: caller holds contentTransaction's lock for the entire snapshot. */
export async function sharedPublicPolicies(
  p: Payload,
  req: Partial<PayloadRequest>,
  locale: "zh" | "en",
) {
  const base = { req, depth: 0 as const };
  const groups = await p.find({
    collection: "policy-groups",
    ...base,
    pagination: false,
    sort: "id",
    where: { activeFactVersion: { exists: true } },
  });
  const policies: PublicPolicyData[] = [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  for (const group of groups.docs) {
    const fact = await p.findByID({
      collection: "policy-fact-versions",
      ...base,
      id: relationID(group.activeFactVersion)!,
    });
    if (relationID(fact.group) !== group.id) throw Error("正式事实引用不属于该政策");
    validateSharedFacts(fact.facts, today, policyTestCountriesAllowed(process.env));
    const draft =
      (
        await p.find({
          collection: "policy-note-drafts",
          ...base,
          limit: 1,
          where: { and: [{ group: { equals: group.id } }, { locale: { equals: locale } }] },
        })
      ).docs[0] || null;
    const id = relationID(draft?.publishedNoteVersion);
    const version = id
      ? await p.findByID({ collection: "policy-note-versions", id, ...base })
      : null;
    const note = approvedSharedNote(group.id, locale, fact.id, draft, version);
    policies.push({ ...publicSharedFacts(fact.facts), publicNotes: note?.publicNotes || "" });
  }
  return { active: groups.docs.length > 0, policies };
}
