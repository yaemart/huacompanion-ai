import { prepareTransfer, applyTransfer, type TransferMutation } from "./assignments";
import type { TransferInput } from "../../lib/crm-assignments";
import { prepareInquiryLink, applyInquiryLink, assertNoActiveLinks } from "./links";
import { createHmac, randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type { CrmClient, CrmContact } from "../../../payload-types";
import { hasRole, isAdmin, isManager, relationID } from "../../cms/access";
import { validOwner } from "../../cms/staff-guards";
import { CrmError, parseCrmAction, type CrmInput } from "../../lib/crm";
import { customerTransaction } from "../customer/service";
import { currentActor, requireClient, unavailable, type CrmActor } from "./access";

export interface CrmReceipt {
  clientID: number;
  revision: number;
  contactID?: number;
  linkID?: number;
  inquiryID?: number;
  clientRevision?: number;
  reference?: string;
  transferID?: number;
  transferredClient?: boolean;
  inquiryIDs?: number[];
}
const conflict = () => new CrmError("资料或操作版本已变化，请核对后重试", 409);
const pick = (i: CrmInput, keys: (keyof CrmInput)[]) =>
  Object.fromEntries(keys.filter((k) => i[k] !== undefined).map((k) => [k, i[k]]));
function version(actual: number, expected?: number) {
  if (actual !== expected) throw conflict();
}
function proof(p: Payload, i: CrmInput) {
  const hmac = (value: string) => createHmac("sha256", p.secret).update(value).digest("hex");
  const canonical = Object.fromEntries(Object.entries(i).sort(([a], [b]) => a.localeCompare(b)));
  return {
    epoch: hmac("crm-epoch-v1"),
    inputDigest: hmac("crm-input-v1:" + JSON.stringify(canonical)),
  };
}
async function createClient(
  p: Payload,
  actor: CrmActor,
  i: CrmInput,
  req: Partial<PayloadRequest>,
) {
  const admin = isAdmin(actor),
    manager = hasRole(actor, "manager");
  if (!admin && (i.teamID !== undefined || (!manager && i.ownerID !== undefined)))
    throw new CrmError("不能指定团队或负责人");
  const team = admin ? i.teamID : relationID(actor.team);
  const owner = admin || manager ? i.ownerID : actor.id;
  if (!team || (!admin && !owner)) throw new CrmError("必须指定团队与负责人");
  if (
    !(await p.find({ collection: "teams", where: { id: { equals: team } }, limit: 1, req })).docs[0]
  )
    throw unavailable();
  if (owner) {
    const staff = (
      await p.find({
        collection: "staff",
        where: { id: { equals: owner } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!validOwner(staff, team)) throw new CrmError("负责人必须是本团队现职运营");
  }
  return p.create({
    collection: "crm-clients",
    data: {
      reference: `CLI-${randomUUID()}`,
      kind: i.kind!,
      displayName: i.displayName!,
      language: i.language!,
      countryCode: i.countryCode,
      team: Number(team),
      owner: owner ? Number(owner) : null,
      status: "active",
      revision: 1,
    },
    req,
  });
}
async function saveContact(p: Payload, c: CrmClient, i: CrmInput, req: Partial<PayloadRequest>) {
  let contact: CrmContact | undefined;
  if (i.contactID) {
    contact = (
      await p.find({
        collection: "crm-contacts",
        where: { and: [{ id: { equals: i.contactID } }, { client: { equals: c.id } }] },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!contact) throw unavailable();
    if (contact.status !== "active") throw conflict();
    if (i.action !== "setPrimaryContact") version(contact.revision, i.expectedRevision);
  }
  if (i.action === "saveContact") {
    const data = pick(i, ["name", "email", "phone", "jobTitle"]);
    const email = i.email === undefined ? contact?.email : i.email;
    const phone = i.phone === undefined ? contact?.phone : i.phone;
    if (!email && !phone) throw new CrmError("至少保留邮箱或电话");
    if (contact)
      return p.update({
        collection: "crm-contacts",
        id: contact.id,
        data: { ...data, revision: contact.revision + 1 },
        req,
      });
    return p.create({
      collection: "crm-contacts",
      data: {
        ...data,
        name: i.name!,
        client: c.id,
        isPrimary: false,
        status: "active",
        revision: 1,
      },
      req,
    });
  }
  if (!contact) throw unavailable();
  if (i.action === "setPrimaryContact") {
    const prior = await p.find({
      collection: "crm-contacts",
      where: {
        and: [
          { client: { equals: c.id } },
          { isPrimary: { equals: true } },
          { id: { not_equals: contact.id } },
        ],
      },
      pagination: false,
      depth: 0,
      req,
    });
    for (const old of prior.docs)
      await p.update({
        collection: "crm-contacts",
        id: old.id,
        data: { isPrimary: false, revision: old.revision + 1 },
        req,
      });
  }
  return p.update({
    collection: "crm-contacts",
    id: contact.id,
    data: {
      isPrimary: i.action === "setPrimaryContact",
      status: i.action === "archiveContact" ? "archived" : "active",
      revision: contact.revision + 1,
    },
    req,
  });
}
export async function crmAction(p: Payload, user: CrmActor, raw: unknown): Promise<CrmReceipt> {
  const i = parseCrmAction(raw);
  return customerTransaction(
    p,
    async (req) => {
      const actor = await currentActor(p, user, req);
      req.user = { ...actor, collection: "staff" };
      if (i.action === "transferAssignments" && !isManager(actor))
        throw new CrmError("需要客户转交管理权限", 403);
      const key = `${actor.id}:${i.operationKey}`;
      const old = (
        await p.find({
          collection: "crm-operations",
          where: { key: { equals: key } },
          limit: 1,
          depth: 0,
          req,
        })
      ).docs[0];
      const c = i.clientID ? await requireClient(p, actor, i.clientID, req) : undefined;
      const linkContext =
        ["linkInquiry", "revokeInquiryLink"].includes(i.action) && c
          ? await prepareInquiryLink(p, actor, c, i, req)
          : undefined;
      const transferContext =
        i.action === "transferAssignments"
          ? await prepareTransfer(p, actor, i as TransferInput, req, Boolean(old))
          : undefined;
      const signature = proof(p, i);
      if (old) {
        if (linkContext && relationID(linkContext.link?.client) !== c?.id) throw unavailable();
        const r = old.result as unknown as CrmReceipt;
        if (!r || !Number.isSafeInteger(r.clientID) || !Number.isSafeInteger(r.revision))
          throw new CrmError("操作回执不可用", 503);
        await requireClient(p, actor, r.clientID, req);
        if (old.epoch !== signature.epoch || old.inputDigest !== signature.inputDigest)
          throw conflict();
        if (
          i.action === "transferAssignments" &&
          (r.clientID !== i.clientID ||
            !Number.isSafeInteger(r.transferID) ||
            r.transferID! < 1 ||
            r.revision < 1 ||
            typeof r.transferredClient !== "boolean" ||
            !Array.isArray(r.inquiryIDs) ||
            new Set(r.inquiryIDs).size !== r.inquiryIDs.length ||
            (!r.transferredClient && r.inquiryIDs.length === 0) ||
            (r.transferredClient && !i.transferClient) ||
            r.inquiryIDs.some(
              (id) => !Number.isSafeInteger(id) || !i.inquiries!.some((q) => q.inquiryID === id),
            ))
        )
          throw new CrmError("转交回执不可用", 503);
        return r;
      }
      let result: CrmReceipt;
      let transferDetails: TransferMutation | undefined;
      let auditDetails: Awaited<ReturnType<typeof applyInquiryLink>> | undefined;
      if (i.action === "createClient") {
        const created = await createClient(p, actor, i, req);
        result = { clientID: created.id, revision: 1, reference: created.reference };
      } else {
        if (!c) throw unavailable();
        if (c.status !== "active") throw conflict();
        version(
          c.revision,
          ["updateClient", "archiveClient"].includes(i.action)
            ? i.expectedRevision
            : i.expectedClientRevision,
        );
        if (transferContext) {
          transferDetails = await applyTransfer(p, actor, i as TransferInput, transferContext, req);
          result = transferDetails.result;
        } else if (linkContext) {
          auditDetails = await applyInquiryLink(p, actor, c, i, linkContext, req);
          result = auditDetails.result;
        } else if (i.action === "updateClient" || i.action === "archiveClient") {
          if (i.action === "archiveClient") await assertNoActiveLinks(p, c.id, req);
          const changes =
            i.action === "archiveClient"
              ? { status: "archived" as const }
              : pick(i, ["displayName", "language", "countryCode"]);
          await p.update({
            collection: "crm-clients",
            id: c.id,
            data: { ...changes, revision: c.revision + 1 },
            req,
          });
          result = { clientID: c.id, revision: c.revision + 1 };
        } else {
          const saved = await saveContact(p, c, i, req);
          await p.update({
            collection: "crm-clients",
            id: c.id,
            data: { revision: c.revision + 1 },
            req,
          });
          result = {
            clientID: c.id,
            contactID: saved.id,
            revision: saved.revision,
            clientRevision: c.revision + 1,
          };
        }
      }
      const audit = await p.create({
        collection: "audit-events",
        req,
        data: {
          entity: "crm",
          recordId: String(result.clientID),
          action: i.action,
          actor: actor.id,
          fields: Object.keys(i)
            .filter((k) => !["operationKey", "reason"].includes(k))
            .join(","),
          before: transferDetails?.before ??
            auditDetails?.before ?? {
              revision: i.expectedClientRevision ?? i.expectedRevision ?? null,
            },
          after: transferDetails?.after ?? {
            ...result,
            ...auditDetails?.after,
            reason: i.reason ?? null,
          },
        },
      });
      if (transferDetails) result.transferID = audit.id;
      await p.create({
        collection: "crm-operations",
        req,
        data: {
          actor: actor.id,
          key,
          operationKey: i.operationKey,
          action: i.action,
          ...signature,
          result: { ...result },
        },
      });
      return result;
    },
    i.action === "transferAssignments" ? { readCommitted: true } : undefined,
  );
}
