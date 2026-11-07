import type { Payload } from "payload";
import { canAccessContentKind, canReviewContent, isAdmin } from "../../cms/access";
import { canEditContent, type ContentUser } from "../../lib/content-model";
import { policyForm } from "../../lib/immigration-policy-editor";
import { ContentError, contentTransaction } from "../content/service";
import { policyActor, referencedPolicy } from "./workflow";
export async function readPolicyEditor(p: Payload, user: ContentUser, id?: number) {
  if (!user) throw new ContentError("需要政策板块权限", 403);
  if (id !== undefined && (!Number.isSafeInteger(id) || id < 1))
    throw new ContentError("工作稿编号无效");
  return contentTransaction(p, async (req) => {
    const actor = await policyActor(p, req, user, "read");
    const drafts = await p.find({
      collection: "content-drafts",
      where: { kind: { equals: "immigration-policy" } },
      pagination: false,
      depth: 0,
      req,
      user: actor,
      overrideAccess: false,
      select: {
        identity: true,
        title: true,
        locale: true,
        revision: true,
        reviewState: true,
        body: true,
        contributors: true,
        lastEditedBy: true,
        submittedBy: true,
        everPublished: true,
      },
    });
    const draft = id === undefined ? null : drafts.docs.find((row) => row.id === id);
    if (draft === undefined) throw new ContentError("工作稿不存在或无权限", 404);
    const record = draft ? await referencedPolicy(p, req, draft) : undefined;
    const people = await p.find({
      collection: "staff",
      pagination: false,
      depth: 0,
      req,
      select: { name: true, role: true, additionalRoles: true, active: true, contentKinds: true },
    });
    return {
      drafts: drafts.docs,
      draft,
      policy: policyForm(record),
      verifiers: people.docs
        .filter((person) => canAccessContentKind(person, "immigration-policy"))
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
export type PolicyEditorData = Awaited<ReturnType<typeof readPolicyEditor>>;
