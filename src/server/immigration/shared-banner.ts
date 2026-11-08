import type { Payload, PayloadRequest } from "payload";
import { relationID } from "../../cms/access";
import { derivePolicyBanner } from "../../lib/immigration-policy-banner";
import { publicSharedFacts, validateSharedFacts } from "../../lib/policy-shared-facts";
import { policyTestCountriesAllowed } from "../../lib/immigration-policy-entry";
import { ContentError } from "../content/service";
/** Caller holds the content lock; undefined alone permits whole-dataset legacy compatibility. */
export async function sharedPolicyBanner(
  p: Payload,
  req: Partial<PayloadRequest>,
  key: string,
  asOf: string,
  forced: boolean,
) {
  const base = { req, depth: 0 as const };
  const groups = (await p.find({ collection: "policy-groups", ...base, pagination: false })).docs;
  const group = groups.find((g) => g.contentKey === key);
  const active = groups.some((g) => relationID(g.activeFactVersion));
  if (!group && !active) return undefined;
  if (active) {
    const old = await p.find({
      collection: "content-published",
      ...base,
      pagination: false,
      where: { active: { equals: true } },
      select: { body: true },
    });
    if (
      old.docs.some(
        ({ body }) =>
          body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          body.kind === "immigration-policy",
      )
    )
      throw new ContentError("旧新正式政策混存，请先完成受保护切换", 503);
  }
  const id = relationID(group?.activeFactVersion);
  if (!id || !group) return derivePolicyBanner(null, null, asOf);
  const fact = await p.findByID({ collection: "policy-fact-versions", id, ...base });
  if (relationID(fact.group) !== group.id) throw Error("正式事实不属于该政策");
  const previous = (
    await p.find({
      collection: "policy-fact-versions",
      ...base,
      limit: 1,
      sort: "-revision",
      where: { and: [{ group: { equals: group.id } }, { revision: { less_than: fact.revision } }] },
    })
  ).docs[0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const visible = (value: unknown) => {
    validateSharedFacts(value, today, policyTestCountriesAllowed(process.env));
    return publicSharedFacts(value);
  };
  return derivePolicyBanner(
    visible(fact.facts),
    previous ? visible(previous.facts) : null,
    asOf,
    forced,
  );
}
