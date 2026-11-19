import { getPayload } from "payload";
import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres";
import config from "../payload.config";
import { isActiveStaff, isAdmin, isManager, relationID, type Staff } from "../cms/access";
import { shanghaiToday } from "../lib/exhibitions";
import { policyPageCopy } from "../lib/immigration-policy-page-copy";
import { contentTransaction, ContentError } from "./content/service";
import { executeSQL } from "./db-types";
import { listPublicPolicies } from "./immigration/public";
import { policyMailReference } from "./policy-subscription";
import { requireCampaignGrant } from "./subscription-campaign-access";

export async function campaignStaffAuth(headers: Headers) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff") throw new ContentError("请使用员工账号登录。", 403);
  return { p, user };
}

type Choice = {
  key: string;
  label: string;
  verifiedOn: string;
  until: string | null;
  policies: { zh?: string; en?: string };
};
type Campaign = { campaignKey: string; revision: number; updated: string };

export async function readCampaignWorkspace(p: Payload, actor: Staff) {
  return contentTransaction(p, async (req) => {
    await executeSQL(p, req.transactionID, sql`SELECT pg_advisory_xact_lock(726281)`);
    if (!isActiveStaff(actor)) throw new ContentError("请使用有效的主管账号登录。", 403);
    const current = await p.findByID({
      collection: "staff",
      id: actor!.id,
      depth: 0,
      req,
      disableErrors: true,
    });
    if (!current || !isManager(current))
      throw new ContentError("本页仅供管理员和获授权主管使用。", 403);
    const admin = isAdmin(current);
    const canDraft = await requireCampaignGrant(p, actor, "policy-updates", req)
      .then(() => true)
      .catch((error) => {
        if (!admin || !(error instanceof ContentError) || error.status !== 403) throw error;
        return false;
      });
    let grants: { staffId: number; name: string; eligible: boolean; enabled: boolean }[] | null =
      null;
    if (admin) {
      const staff = await p.find({
        collection: "staff",
        req,
        pagination: false,
        depth: 0,
        select: { name: true, role: true, additionalRoles: true, active: true },
        sort: "id",
      });
      const records = await p.find({
        collection: "subscription-campaign-grants",
        req,
        pagination: false,
        depth: 0,
        where: { topic: { equals: "policy-updates" } },
      });
      grants = staff.docs
        .filter((who) => isManager(who) || records.docs.some((g) => relationID(g.staff) === who.id))
        .map((who) => ({
          staffId: who.id,
          name: who.name,
          eligible: isManager(who),
          enabled: records.docs.some((g) => relationID(g.staff) === who.id && g.enabled),
        }));
    }
    const choices = new Map<string, Choice>();
    let campaigns: Campaign[] = [];
    if (canDraft) {
      const shared = await p.count({
        collection: "policy-groups",
        req,
        where: { activeFactVersion: { exists: true } },
      });
      for (const locale of ["zh", "en"] as const) {
        const published = await listPublicPolicies(p, locale, req);
        if (!shared.totalDocs) continue;
        const keys = published.map((policy) =>
          policyMailReference("en", { ...policy, publicNotes: "" }),
        );
        for (const [index, policy] of published.entries()) {
          if (policy.validUntil && policy.validUntil < shanghaiToday()) continue;
          const key = keys[index];
          if (keys.indexOf(key) !== keys.lastIndexOf(key)) continue;
          const choice = choices.get(key) ?? {
            key,
            label: `${policy.countryNameZh} · ${policyPageCopy.zh.methods[policy.policyType]}`,
            verifiedOn: policy.lastVerifiedOn,
            until: policy.validUntil ?? null,
            policies: {},
          };
          choice.policies[locale] = policyMailReference(locale, policy);
          choices.set(key, choice);
        }
      }
      const result = await executeSQL(
        p,
        req.transactionID,
        sql`
        SELECT * FROM (SELECT DISTINCT ON (campaign_key) campaign_key AS "campaignKey", revision::int,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated
          FROM subscription_campaign_drafts WHERE owner_id=${current.id}
          ORDER BY campaign_key, revision DESC) latest ORDER BY updated DESC LIMIT 50
      `,
      );
      campaigns = result.rows as Campaign[];
    }
    return { canDraft, grants, choices: [...choices.values()], campaigns };
  });
}
