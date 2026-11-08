import type { Payload, PayloadRequest } from "payload";
import type { ContentDraft, ImmigrationPolicy } from "../../../payload-types";
import { canEditContent, type ContentUser, type ContentBody } from "../../lib/content-model";
import { policyDraft, policyFields } from "../../lib/immigration-policy-draft";
import { publicPolicy, validatePolicyPublication } from "../../lib/immigration-policy";
import { canAccessContentKind, relationID, canReviewContent } from "../../cms/access";
import { ContentError } from "../content/error";
import {
  assertPolicyCountry,
  policyTestCountriesAllowed,
} from "../../lib/immigration-policy-entry";
type Req = Partial<PayloadRequest>;
function checkCountry(code: unknown) {
  try {
    assertPolicyCountry(code, policyTestCountriesAllowed(process.env));
  } catch {
    throw new ContentError("国家代码不在可选名单中，请重新选择国家；虚构国家仅供本地测试");
  }
}

export async function policyActor(p: Payload, req: Req, user: ContentUser, action: string) {
  // Same content -> staff lock order as quality review and staff authority edits.
  const sessions = p.db.sessions as
    Record<string, { db: { execute: (query: string) => Promise<unknown> } }> | undefined;
  const id = await req.transactionID;
  if (!id || !sessions?.[id]) throw Error("Transaction session missing");
  await sessions[id].db.execute("SELECT pg_advisory_xact_lock(726281)");
  const actor = await p.findByID({ collection: "staff", id: Number(user?.id), depth: 0, req });
  if (
    !canAccessContentKind(actor, "immigration-policy") ||
    (action !== "read" &&
      (["save", "restore", "submit"].includes(action)
        ? !canEditContent(actor)
        : !canReviewContent(actor)))
  )
    throw new ContentError("需要有效的政策板块编辑或审核权限", 403);
  return actor;
}

export async function referencedPolicy(
  p: Payload,
  req: Req,
  current: Pick<ContentDraft, "body" | "identity">,
) {
  const ref = (current.body as unknown as ContentBody).policyRef;
  if (!ref || !Number.isSafeInteger(ref.id) || !Number.isSafeInteger(ref.revision))
    throw new ContentError("政策引用缺失，请刷新工作稿", 409);
  const record = await p.findByID({
    collection: "immigration-policies",
    id: ref.id,
    depth: 0,
    req,
  });
  if (record.policyKey !== current.identity || record.revision !== ref.revision)
    throw new ContentError("政策已经更新或引用不属于此工作稿", 409);
  return record;
}

export async function savePolicyDraft(
  p: Payload,
  req: Req,
  current: ContentDraft | null,
  body: ContentBody,
  input: unknown,
  restoring: boolean,
) {
  const record = current ? await referencedPolicy(p, req, current) : null;
  let data = input === undefined ? {} : policyDraft(input);
  if (restoring) {
    const ref = body.policyRef;
    if (!record || !ref || ref.id !== record.id) throw new ContentError("历史政策引用无效", 409);
    const history = await p.findVersions({
      collection: "immigration-policies",
      depth: 0,
      req,
      sort: "-updatedAt",
      limit: 1,
      where: {
        and: [{ parent: { equals: record.id } }, { "version.revision": { equals: ref.revision } }],
      },
    });
    const old = history.docs[0]?.version;
    if (!old) throw new ContentError("政策历史已清理，不能恢复该版本", 409);
    data = Object.fromEntries(policyFields.map((key) => [key, old[key] ?? null]));
  }
  delete body.policy;
  checkCountry({ ...record, ...data }.countryCode);
  const duplicate = await p.count({
    collection: "content-drafts",
    req,
    where: {
      and: [
        { id: { not_equals: current?.id || 0 } },
        {
          or: [
            { identity: { equals: `${body.contentKey}:${body.locale}` } },
            { routeKey: { equals: `immigration-policy:${body.locale}:${body.slug}` } },
          ],
        },
      ],
    },
  });
  const orphan =
    !current &&
    (await p.count({
      collection: "immigration-policies",
      req,
      where: { policyKey: { equals: `${body.contentKey}:${body.locale}` } },
    }));
  if (duplicate.totalDocs || (orphan && orphan.totalDocs))
    throw new ContentError("内容标识或网址标识已存在，请在高级区修改；原记录未覆盖", 409);
  const write = { ...data, status: "draft" as const, revision: (record?.revision || 0) + 1 };
  const saved = record
    ? await p.update({ collection: "immigration-policies", id: record.id, data: write, req })
    : await p.create({
        collection: "immigration-policies",
        data: { ...write, policyKey: `${body.contentKey}:${body.locale}` },
        req,
      });
  return { id: saved.id, revision: saved.revision };
}

export async function checkPolicyDraft(p: Payload, req: Req, current: ContentDraft) {
  if (current.kind === "immigration-policy") await referencedPolicy(p, req, current);
}

export async function publishPolicy(
  p: Payload,
  req: Req,
  current: ContentDraft,
  reviewed: unknown,
) {
  const record = await referencedPolicy(p, req, current);
  checkCountry(record.countryCode);
  if (reviewed !== true) throw new ContentError("请确认已人工核实国家代码、官方来源和政策条件");
  const fields = {
    ...Object.fromEntries(policyFields.map((key) => [key, record[key]])),
    publicNotes: record.publicNotes ?? "",
    portsAndRegions: (record.portsAndRegions || []).map((row) => row.label),
    verifiedBy: relationID(record.verifiedBy),
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  validatePolicyPublication(fields, today);
  const verifier = await p.findByID({ collection: "staff", id: fields.verifiedBy, depth: 0, req });
  if (!canAccessContentKind(verifier, "immigration-policy"))
    throw new ContentError("核实人必须为启用且获政策板块授权的员工", 403);
  await p.update({
    collection: "immigration-policies",
    id: record.id,
    data: { status: "published" },
    req,
  });
  return publicPolicy(fields);
}

export async function unpublishPolicy(p: Payload, req: Req, current: ContentDraft) {
  const record: ImmigrationPolicy = await referencedPolicy(p, req, current);
  await p.update({
    collection: "immigration-policies",
    id: record.id,
    data: { status: "draft" },
    req,
  });
}
