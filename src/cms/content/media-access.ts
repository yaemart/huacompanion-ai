import type { Payload, PayloadRequest, Where } from "payload";
import { canManageContent, contentScope, isAdmin, type Staff } from "../access";
import type { ContentBody } from "../../lib/content-model";

// Media IDs are derived only from drafts visible to this staff member.
export async function mediaScope(
  p: Payload,
  user: Staff,
  req?: Partial<PayloadRequest>,
): Promise<boolean | Where> {
  if (isAdmin(user)) return true;
  if (!canManageContent(user) || contentScope(user) === false) return false;
  const ids = new Set<number>();
  let page = 1;
  for (;;) {
    const drafts = await p.find({
      collection: "content-drafts",
      overrideAccess: false,
      user: user as PayloadRequest["user"],
      req,
      depth: 0,
      limit: 100,
      page,
    });
    for (const draft of drafts.docs) {
      for (const block of (draft.body as unknown as ContentBody).blocks || [])
        if (block.type === "image" && block.mediaId) ids.add(block.mediaId);
    }
    if (!drafts.hasNextPage) break;
    page++;
  }
  return { or: [{ uploadedBy: { equals: user!.id } }, { id: { in: [...ids] } }] };
}
