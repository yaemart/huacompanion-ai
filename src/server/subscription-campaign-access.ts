import type { Payload, PayloadRequest } from "payload";
import type { SubscriptionCampaignGrant } from "../../payload-types";
import { isActiveStaff, isManager, type Staff } from "../cms/access";
import { businessTransaction } from "./business/service";
import { ContentError } from "./content/error";
import { requireSubscriptionAdmin } from "./subscription-management";

type Topic = "policy-updates";
type GrantInput = { staffId: number; topic: Topic; enabled: boolean };
type CampaignAuthority = { actorId: number; grantId: number; grantRevision: number; topic: Topic };
const collection = "subscription-campaign-grants";

function inputFor(value: unknown): GrantInput {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["staffId", "topic", "enabled"].includes(key)) ||
    !("staffId" in value) ||
    typeof value.staffId !== "number" ||
    !Number.isSafeInteger(value.staffId) ||
    value.staffId <= 0 ||
    !("topic" in value) ||
    value.topic !== "policy-updates" ||
    !("enabled" in value) ||
    typeof value.enabled !== "boolean"
  )
    throw new ContentError("请选择有效员工、政策更新主题和授权状态。", 400);
  return { staffId: value.staffId, topic: value.topic, enabled: value.enabled };
}

export async function requireCampaignGrant(
  payload: Payload,
  actor: Staff,
  topic: Topic,
  req?: Partial<PayloadRequest>,
): Promise<CampaignAuthority> {
  if (!actor || !isActiveStaff(actor)) throw new ContentError("请使用已授权的主管账号登录。", 403);
  if (topic !== "policy-updates") throw new ContentError("请选择政策更新主题。", 400);
  if (!req?.transactionID)
    return businessTransaction(payload, (scope) =>
      requireCampaignGrant(payload, actor, topic, scope),
    );
  const current = await payload.findByID({
    collection: "staff",
    id: actor.id,
    depth: 0,
    disableErrors: true,
    req,
  });
  if (!current || !isManager(current))
    throw new ContentError("当前账号没有主管群发操作资格。", 403);
  const { docs } = await payload.find({
    collection,
    where: { staff: { equals: current.id }, topic: { equals: topic } },
    limit: 1,
    depth: 0,
    req,
  });
  const grant = docs[0];
  if (!grant?.enabled) throw new ContentError("该主题尚未授权或已撤销，请联系管理员。", 403);
  return { actorId: current.id, grantId: grant.id, grantRevision: grant.revision, topic };
}

export async function setCampaignGrant(payload: Payload, actor: Staff, input: GrantInput) {
  const result = await businessTransaction(payload, async (req) => {
    const admin = await requireSubscriptionAdmin(payload, actor, req);
    const data = inputFor(input);
    const target = await payload.findByID({
      collection: "staff",
      id: data.staffId,
      depth: 0,
      disableErrors: true,
      req,
    });
    if (!target || (data.enabled && !isManager(target)))
      throw new ContentError("只能向已启用的主管授予群发操作权限。", 403);
    const { docs } = await payload.find({
      collection,
      where: { staff: { equals: data.staffId }, topic: { equals: data.topic } },
      depth: 0,
      limit: 1,
      req,
    });
    const previous = docs[0];
    if (previous && previous.enabled === data.enabled) return { grant: previous, auditId: null };
    const update = {
      staff: data.staffId,
      topic: data.topic,
      enabled: data.enabled,
      revision: (previous?.revision ?? 0) + 1,
      changedBy: admin.id,
    };
    const grant: SubscriptionCampaignGrant = previous
      ? await payload.update({ collection, id: previous.id, data: update, depth: 0, req })
      : await payload.create({ collection, data: update, depth: 0, req });
    const audit = await payload.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        recordId: String(grant.id),
        action: data.enabled ? "grant" : "revoke",
        actor: admin.id,
        fields: "staff,topic,enabled,revision",
        before: previous
          ? {
              staffId: data.staffId,
              topic: data.topic,
              enabled: previous.enabled,
              revision: previous.revision,
            }
          : null,
        after: {
          staffId: data.staffId,
          topic: data.topic,
          enabled: grant.enabled,
          revision: grant.revision,
        },
      },
    });
    return { grant, auditId: audit.id };
  });
  if (result.auditId !== null) {
    // The database adapter can swallow COMMIT failures; a missing audit means the grant did not commit.
    const persisted = await payload.findByID({
      collection: "audit-events",
      id: result.auditId,
      depth: 0,
      disableErrors: true,
    });
    if (!persisted) throw new ContentError("授权记录未保存成功，请刷新后重试。", 503);
  }
  return result.grant;
}
