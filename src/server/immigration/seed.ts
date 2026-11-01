import type { Payload } from "payload";
import { canEditContent, type ContentUser } from "../../lib/content-model";
import { parsePolicySeeds } from "../../lib/immigration-policy-seed";
import { ContentError, contentTransaction, mutateContent } from "../content/service";
import { policyActor } from "./workflow";

export async function seedPolicyDrafts(
  p: Payload,
  user: ContentUser,
  input: unknown,
  options: { apply?: boolean } = {},
) {
  const rows = parsePolicySeeds(input);
  if (!canEditContent(user)) throw new ContentError("需要政策编辑权限", 403);
  await contentTransaction(p, (req) => policyActor(p, req, user, "save"));
  const result = { created: [] as string[], skipped: [] as string[], pending: [] as string[] };
  async function exists(identity: string) {
    const [drafts, policies] = await Promise.all([
      p.count({ collection: "content-drafts", where: { identity: { equals: identity } } }),
      p.count({ collection: "immigration-policies", where: { policyKey: { equals: identity } } }),
    ]);
    return drafts.totalDocs > 0 || policies.totalDocs > 0;
  }
  for (const row of rows) {
    const identity = `${row.body.contentKey}:${row.body.locale}`;
    if (await exists(identity)) {
      result.skipped.push(identity);
    } else if (options.apply !== true) {
      result.pending.push(identity);
    } else {
      try {
        // No id is supplied: the existing workflow can only create, never update a record.
        await mutateContent(p, user, { action: "save", body: row.body, policy: row.policy });
        result.created.push(identity);
      } catch (error) {
        // A competing create is protected by the workflow transaction and unique policy key.
        if (!(await exists(identity))) throw error;
        result.skipped.push(identity);
      }
    }
  }
  return result;
}
