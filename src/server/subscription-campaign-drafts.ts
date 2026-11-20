import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import type { SubscriptionCampaignDraft } from "../../payload-types";
import { relationID, type Staff } from "../cms/access";
import { contentTransaction, ContentError } from "./content/service";
import { executeSQL } from "./db-types";
import { requireCampaignGrant } from "./subscription-campaign-access";
import {
  campaignCounts,
  campaignPolicies,
  prepareCampaignPreview,
  type CampaignPreview,
} from "./subscription-campaign-preview";

const collection = "subscription-campaign-drafts";
const topic = "policy-updates";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Scope = Partial<PayloadRequest>;

function campaignTransaction<T>(
  p: Payload,
  actor: Staff,
  run: (req: Scope, owner: number) => Promise<T>,
) {
  return contentTransaction(p, async (req) => {
    // One transaction, content then business lock: publishing and revocation cannot race this operation.
    await executeSQL(p, req.transactionID, sql`SELECT pg_advisory_xact_lock(726281)`);
    const grant = await requireCampaignGrant(p, actor, topic, req);
    return run(req, grant.actorId);
  });
}

function campaignKey(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new ContentError("活动编号无效，请重新打开活动。", 400);
  return value;
}

async function latest(p: Payload, req: Scope, owner: number, key: string) {
  const { docs } = await p.find({
    collection,
    req,
    depth: 0,
    limit: 1,
    sort: "-revision",
    where: { campaignKey: { equals: key } },
  });
  if (!docs[0] || relationID(docs[0].owner) !== owner)
    throw new ContentError("找不到本人可操作的活动。", 404);
  return docs[0];
}

async function report(p: Payload, req: Scope, row: SubscriptionCampaignDraft) {
  const selection = row.selections as { policies: unknown; sourceVersion: string };
  const preview = row.preview as CampaignPreview;
  let current = false;
  try {
    const prepared = await prepareCampaignPreview(p, req, campaignPolicies(selection.policies));
    current =
      prepared.sourceVersion === selection.sourceVersion &&
      isDeepStrictEqual(prepared.preview, preview);
  } catch (error) {
    if (!(error instanceof ContentError) || error.status !== 400) throw error;
  }
  return {
    campaignKey: row.campaignKey,
    revision: row.revision,
    topic: row.topic,
    policies: campaignPolicies(selection.policies),
    preview,
    current,
    counts: await campaignCounts(p, req, preview),
    asOf: new Date().toISOString(),
  };
}

export async function readCampaignDraft(p: Payload, actor: Staff, key: unknown) {
  return campaignTransaction(p, actor, async (req, owner) =>
    report(p, req, await latest(p, req, owner, campaignKey(key))),
  );
}

export async function withCampaignDraft<T>(
  p: Payload,
  actor: Staff,
  key: unknown,
  revision: unknown,
  run: (
    req: Scope,
    row: SubscriptionCampaignDraft,
    snapshot: Awaited<ReturnType<typeof report>>,
  ) => Promise<T>,
) {
  return campaignTransaction(p, actor, async (req, owner) => {
    const row = await latest(p, req, owner, campaignKey(key));
    if (revision !== row.revision) throw new ContentError("草稿已有更新，请刷新后重新测试。", 409);
    return run(req, row, await report(p, req, row));
  });
}

export async function saveCampaignDraft(p: Payload, actor: Staff, input: unknown) {
  const saved = await campaignTransaction(p, actor, async (req, owner) => {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !["campaignKey", "revision", "policies"].includes(key)) ||
      !("policies" in input)
    )
      throw new ContentError("请选择政策资料，正文由已发布版本生成。", 400);
    const policies = campaignPolicies(input.policies);
    const key = "campaignKey" in input ? campaignKey(input.campaignKey) : randomUUID();
    let revision = 1;
    if ("campaignKey" in input) {
      const previous = await latest(p, req, owner, key);
      if (!("revision" in input) || input.revision !== previous.revision)
        throw new ContentError("草稿已有更新，请刷新后再修改。", 409);
      revision = previous.revision + 1;
    } else if ("revision" in input) throw new ContentError("新活动无需填写版本。", 400);
    const prepared = await prepareCampaignPreview(p, req, policies);
    const row = await p.create({
      collection,
      req,
      depth: 0,
      data: {
        campaignKey: key,
        owner,
        topic,
        revision,
        selections: { policies, sourceVersion: prepared.sourceVersion },
        preview: prepared.preview,
      },
    });
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        recordId: key,
        action: "save-draft",
        actor: owner,
        fields: "revision,topic,sourceVersion",
        after: { revision, topic, sourceVersion: prepared.sourceVersion },
      },
    });
    return { auditId: audit.id, rowId: row.id };
  });
  // The adapter may swallow deferred COMMIT failures. Never announce a non-persisted draft as saved.
  const audit = await p.findByID({
    collection: "audit-events",
    id: saved.auditId,
    disableErrors: true,
    depth: 0,
  });
  if (!audit) throw new ContentError("草稿未保存成功，请刷新后重试。", 503);
  return campaignTransaction(p, actor, async (req) => {
    const row = await p.findByID({ collection, id: saved.rowId, req, depth: 0 });
    return report(p, req, row);
  });
}
