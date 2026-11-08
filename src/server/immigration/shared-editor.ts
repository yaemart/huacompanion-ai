import type { Payload } from "payload";
import { canEditContent, type ContentUser } from "../../lib/content-model";
import { canAccessContentKind, canReviewContent, isAdmin, relationID } from "../../cms/access";
import { sharedPolicyForm } from "../../lib/policy-shared-form";
import {
  policyCountryOptions,
  policyTestCountriesAllowed,
} from "../../lib/immigration-policy-entry";
import { policyVerificationDefaults, type PolicyListRow } from "../../lib/immigration-policy-list";
import { contentTransaction, ContentError } from "../content/service";
import { versionsFor } from "./shared-facts-service";
import { policyActor } from "./workflow";
export async function readSharedFactEditor(p: Payload, user: ContentUser, groupId?: number) {
  if (groupId !== undefined && (!Number.isSafeInteger(groupId) || groupId < 1))
    throw new ContentError("政策编号无效");
  return contentTransaction(p, async (req) => {
    const actor = await policyActor(p, req, user, "read");
    const base = { req, depth: 0 as const };
    const groups = (
      await p.find({ collection: "policy-groups", ...base, pagination: false, sort: "id" })
    ).docs;
    const drafts = (await p.find({ collection: "policy-fact-drafts", ...base, pagination: false }))
      .docs;
    const group = groups.find((g) => g.id === groupId) || null;
    const draft = drafts.find((d) => relationID(d.group) === groupId) || null;
    if (groupId !== undefined && (!group || !draft)) throw new ContentError("政策不存在", 404);
    const versions = group ? await versionsFor(p, req, group.id) : [];
    const defaults = policyVerificationDefaults(actor.id, new Date());
    const people = (
      await p.find({
        collection: "staff",
        ...base,
        pagination: false,
        select: { name: true, role: true, additionalRoles: true, active: true, contentKinds: true },
      })
    ).docs;
    const rows: PolicyListRow[] = drafts.map((d) => {
      const f = sharedPolicyForm(d.facts);
      return {
        id: Number(relationID(d.group)),
        title: "中英共用事实",
        locale: "zh",
        reviewState: d.reviewState,
        country: f.countryNameZh || f.countryNameEn || f.countryCode || null,
        policyType: f.policyType,
        validUntil: f.validUntil ?? null,
        lastVerifiedOn: f.lastVerifiedOn ?? null,
      };
    });
    return {
      group,
      draft,
      versions,
      rows,
      today: defaults.lastVerifiedOn,
      policy: { ...sharedPolicyForm(draft?.facts), ...(!draft ? defaults : {}) },
      countries: policyCountryOptions(policyTestCountriesAllowed(process.env)),
      verifiers: people
        .filter((v) => canAccessContentKind(v, "immigration-policy"))
        .map(({ id, name }) => ({ id, name })),
      permissions: {
        canEdit: canEditContent(actor),
        canReview: canReviewContent(actor),
        isAdmin: isAdmin(actor),
        userId: actor.id,
      },
    };
  });
}
export type SharedFactEditorData = Awaited<ReturnType<typeof readSharedFactEditor>>;
