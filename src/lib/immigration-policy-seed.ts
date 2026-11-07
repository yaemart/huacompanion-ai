import { validateContent, type ContentBody } from "./content-model.ts";
import { policyDraft } from "./immigration-policy-draft.ts";
import { policyTypes } from "./immigration-policy.ts";

export type PolicySeed = { body: ContentBody; policy: Record<string, unknown> };
export function parsePolicySeeds(value: unknown): PolicySeed[] {
  if (!Array.isArray(value) || value.length > 100) throw Error("种子必须为最多100项的数组");
  const identities = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw Error("种子格式无效");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["contentKey", "locale", "title", "policy"].includes(key)))
      throw Error("种子仅允许内容标识、语言、标题和政策字段");
    if (row.locale !== "en" && row.locale !== "zh") throw Error("政策种子仅支持中英文");
    if (typeof row.contentKey !== "string") throw Error("内容标识须为字符串");
    const body: unknown = {
      kind: "immigration-policy",
      locale: row.locale,
      contentKey: row.contentKey,
      slug: row.contentKey,
      title: row.title,
      blocks: [],
      sources: [],
    };
    validateContent(body);
    const identity = `${body.contentKey}:${body.locale}`;
    if (identities.has(identity)) throw Error("种子身份重复");
    identities.add(identity);
    policyDraft(row.policy);
    const policy = structuredClone(row.policy) as Record<string, unknown>;
    if (policy.policyType != null && !policyTypes.some((type) => type === policy.policyType))
      throw Error("政策类型无效");
    if ("verifiedBy" in policy || "lastVerifiedOn" in policy)
      throw Error("核实人和核实日期须由工作人员在后台填写");
    return { body, policy };
  });
}
