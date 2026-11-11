import type { Payload, PayloadRequest } from "payload";
import { canAccessContentKind, contentKinds, relationID } from "../../cms/access";
import {
  canEditContent,
  type Block,
  type ContentBody,
  type ContentUser,
} from "../../lib/content-model";
import { parsePolicyBannerBlock } from "../../lib/immigration-policy-banner";
import { policyTestCountriesAllowed } from "../../lib/immigration-policy-entry";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { cleanPublicPolicy } from "../../lib/immigration-policy-query";
import {
  isPolicyBannerLocale,
  newPolicyBannerKeys,
  policyBannerChoice,
  type PolicyBannerChoice,
  type PolicyBannerLocale,
} from "../../lib/policy-banner-picker";
import { validateSharedFacts } from "../../lib/policy-shared-facts";
import { ContentError } from "../content/error";

async function publishedChoices(
  p: Payload,
  req: Partial<PayloadRequest>,
  locale: PolicyBannerLocale,
) {
  const base = { req, depth: 0 as const, pagination: false as const, overrideAccess: true };
  const groups = (
    await p.find({
      ...base,
      collection: "policy-groups",
      select: { contentKey: true, activeFactVersion: true },
    })
  ).docs;
  const active = groups.flatMap((group) => {
    const version = relationID(group.activeFactVersion);
    return version ? [{ group, version }] : [];
  });
  const legacy = (
    await p.find({
      ...base,
      collection: "content-published",
      where: { active: { equals: true } },
      select: { body: true },
    })
  ).docs.flatMap(({ body }) =>
    body && typeof body === "object" && !Array.isArray(body) && body.kind === "immigration-policy"
      ? [body]
      : [],
  );
  if (active.length && legacy.length)
    throw new ContentError("旧新正式政策混存，请先完成受保护切换", 503);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  if (active.length) {
    const versions = (
      await p.find({
        ...base,
        collection: "policy-fact-versions",
        where: { id: { in: active.map(({ version }) => version) } },
        select: { group: true, facts: true },
      })
    ).docs;
    const byId = new Map(versions.map((version) => [version.id, version]));
    return active.map(({ group, version }) => {
      const fact = byId.get(version);
      if (!fact || relationID(fact.group) !== group.id) throw Error("正式事实不属于该政策");
      validateSharedFacts(fact.facts, today, policyTestCountriesAllowed(process.env));
      return policyBannerChoice(group.contentKey, fact.facts);
    });
  }
  const sharedKeys = new Set(groups.map(({ contentKey }) => contentKey));
  const candidates = new Map<string, unknown[]>();
  for (const body of legacy) {
    const ref = parsePolicyBannerBlock({ type: "policy-banner", text: body.contentKey });
    if (body.locale !== locale || !ref || sharedKeys.has(ref.key)) continue;
    candidates.set(ref.key, [...(candidates.get(ref.key) ?? []), body.policy]);
  }
  const choices: PolicyBannerChoice[] = [];
  for (const [key, policies] of candidates) {
    if (policies.length !== 1) continue;
    const policy = cleanPublicPolicy(policies[0], today);
    if (policy) choices.push(policyBannerChoice(key, policy));
  }
  return choices;
}

export async function policyBannerChoicesFor(
  p: Payload,
  req: Partial<PayloadRequest>,
  user: ContentUser,
  kind: string,
  locale: unknown,
) {
  if (
    kind === "immigration-policy" ||
    !contentKinds.some((candidate) => candidate === kind) ||
    !canEditContent(user) ||
    !canAccessContentKind(user, kind)
  )
    throw new ContentError("无此文章板块的编辑权限", 403);
  if (!isPolicyBannerLocale(locale)) throw new ContentError("政策横幅仅支持中英文");
  if (!visaCheckerEnabled()) return [];
  const choices = await publishedChoices(p, req, locale);
  return choices.sort(
    (a, b) => a.countryCode.localeCompare(b.countryCode) || a.key.localeCompare(b.key),
  );
}

export async function assertPublishedBannerReferences(
  p: Payload,
  req: Partial<PayloadRequest>,
  before: readonly Block[],
  body: ContentBody,
) {
  const added = newPolicyBannerKeys(before, body.blocks);
  if (!added.length) return;
  if (!visaCheckerEnabled() || !isPolicyBannerLocale(body.locale))
    throw new ContentError("当前无法新增政策横幅，请移除新增的横幅后保存。", 409);
  const available = new Set((await publishedChoices(p, req, body.locale)).map(({ key }) => key));
  if (added.some((key) => !available.has(key)))
    throw new ContentError("所选政策当前未发布，请刷新政策列表并重新选择。", 409);
}
