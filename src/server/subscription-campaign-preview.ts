import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { publicSharedFacts, type SharedPolicyFacts } from "../lib/policy-shared-facts";
import { shanghaiToday } from "../lib/exhibitions";
import { ContentError } from "./content/error";
import { executeSQL } from "./db-types";
import { listPublicPolicies } from "./immigration/public";
import { isPolicyReference, policyMailBody, policyMailReference } from "./policy-subscription";

type Pair = { zh?: string; en?: string };
type Message = { subject: string; body: string };
export type CampaignPreview = { zh: Message | null; en: Message | null };
const languages = ["zh", "en"] as const;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function campaignPolicies(value: unknown): Pair[] {
  if (!Array.isArray(value) || !value.length || value.length > 10)
    throw new ContentError("请选择 1 至 10 项已发布政策。", 400);
  const used = new Set<string>();
  for (const pair of value) {
    if (
      !pair ||
      typeof pair !== "object" ||
      Array.isArray(pair) ||
      !Object.keys(pair).length ||
      Object.keys(pair).some((key) => !languages.includes(key as "zh" | "en"))
    )
      throw new ContentError("政策只接受已发布的中文或英文资料。", 400);
    for (const reference of Object.values(pair)) {
      if (!isPolicyReference(reference) || used.has(reference))
        throw new ContentError("政策资料无效或重复，请重新选择。", 400);
      used.add(reference);
    }
  }
  return value;
}

export async function prepareCampaignPreview(
  p: Payload,
  req: Partial<PayloadRequest>,
  policies: Pair[],
) {
  const preview: CampaignPreview = { zh: null, en: null };
  const sources: string[][] = [];
  const facts = policies.map(() => "");
  for (const locale of languages) {
    const published = await listPublicPolicies(p, locale, req);
    const { rows } = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`
      SELECT f.facts, jsonb_build_array(g.id, f.id, v.id) AS stamp
      FROM policy_groups g JOIN policy_fact_versions f ON f.id=g.active_fact_version_id
      LEFT JOIN policy_note_drafts n ON n.group_id=g.id AND n.locale=${locale}
      LEFT JOIN policy_note_versions v ON v.id=n.published_note_version_id AND NOT n.needs_review
        AND v.based_on_fact_version_id=f.id AND v.group_id=g.id AND v.locale=${locale}
    `,
    );
    const bodies: string[] = [];
    for (const [index, pair] of policies.entries()) {
      const reference = pair[locale];
      if (!reference) continue;
      const matches = published.filter(
        (policy) => policyMailReference(locale, policy) === reference,
      );
      const policy = matches[0];
      if (matches.length !== 1 || (policy.validUntil && policy.validUntil < shanghaiToday()))
        throw new ContentError("所选政策已改版、下架或过期，请重新选择已发布资料。", 400);
      const factKey = policyMailReference("en", { ...policy, publicNotes: "" });
      if (facts[index] && facts[index] !== factKey)
        throw new ContentError("同一项中英文必须选择相同的政策事实。", 400);
      facts[index] = factKey;
      const versions = (rows as { facts: SharedPolicyFacts; stamp: unknown }[]).filter(
        (row) => policyMailReference("en", publicSharedFacts(row.facts)) === factKey,
      );
      if (versions.length !== 1)
        throw new ContentError("请先在政策工作台发布共用事实版本，再选择资料。", 400);
      sources[index] ??= [];
      sources[index].push(digest([locale, reference, versions[0].stamp]));
      bodies.push(policyMailBody(policy, locale));
    }
    // A language is available only when every selected policy has that language's published material.
    if (bodies.length === policies.length)
      preview[locale] = {
        subject: locale === "zh" ? "华伴 · 政策更新" : "Hua Companion · Policy updates",
        body: bodies.join("\n\n────────\n\n"),
      };
  }
  if (!preview.zh && !preview.en) throw new ContentError("请至少为一种语言选齐全部政策。", 400);
  return { preview, sourceVersion: digest(sources) };
}

export async function campaignCounts(
  p: Payload,
  req: Partial<PayloadRequest>,
  preview: CampaignPreview,
) {
  const { rows } = await executeSQL(
    p,
    (await req.transactionID)!,
    sql`
    SELECT locale, count(*)::int AS n FROM subscriptions
    WHERE topic='policy-updates' AND status='confirmed' AND confirmed_at IS NOT NULL
      AND consent_version >= 1 AND privacy_version=${process.env.PRIVACY_VERSION?.trim() || ""}
      AND privacy_version<>'' GROUP BY locale
  `,
  );
  const counts = { zh: 0, en: 0, excluded: 0 };
  for (const row of rows as { locale: string; n: number }[]) {
    if ((row.locale === "zh" || row.locale === "en") && preview[row.locale])
      counts[row.locale] += row.n;
    else counts.excluded += row.n;
  }
  return counts;
}
