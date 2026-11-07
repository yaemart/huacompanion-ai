import type { Payload } from "payload";
import type { ContentBody, ContentUser } from "../../lib/content-model";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { readPolicyEditor } from "../immigration/editor";
import { ContentError } from "./error";

export async function readContentPreview(p: Payload, user: ContentUser, id: number) {
  const draft = await p.findByID({ collection: "content-drafts", id, overrideAccess: false, user });
  if ((draft.body as unknown as ContentBody).kind !== "immigration-policy")
    return { draft, policy: null };
  if (!visaCheckerEnabled()) throw new ContentError("页面不存在", 404);
  const view = await readPolicyEditor(p, user, draft.id);
  if (!view.draft) throw new ContentError("工作稿不存在或无权限", 404);
  return { draft: view.draft, policy: view.policy };
}
