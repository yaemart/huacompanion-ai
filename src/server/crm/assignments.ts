import type { Payload, PayloadRequest } from "payload";
import type { CrmClient, Inquiry, ServiceCase } from "../../../payload-types";
import { isManager, relationID } from "../../cms/access";
import { validOwner } from "../../cms/staff-guards";
import { CrmError } from "../../lib/crm";
import type { TransferInput, TransferReceipt } from "../../lib/crm-assignments";
import { requireClient, unavailable, type CrmActor } from "./access";
import { inquiryFilter } from "./links";
interface TransferItem {
  inquiry: Inquiry;
  service: ServiceCase | null;
}
export interface TransferContext {
  client: CrmClient;
  items: TransferItem[];
}
const conflict = () => new CrmError("转交资料或版本已变化，请重新核对", 409);
export async function prepareTransfer(
  p: Payload,
  actor: CrmActor,
  i: TransferInput,
  req: Partial<PayloadRequest>,
  replay = false,
): Promise<TransferContext> {
  if (!isManager(actor)) throw new CrmError("需要客户转交管理权限", 403);
  const client = await requireClient(p, actor, i.clientID, req);
  const team = relationID(client.team);
  if (!replay) {
    if (client.status !== "active" || client.revision !== i.expectedClientRevision)
      throw conflict();
    const recipient = (
      await p.find({
        collection: "staff",
        where: { id: { equals: i.recipientID } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!validOwner(recipient, team)) throw new CrmError("接收者必须是本团队现职运营", 400);
  }
  const items: TransferItem[] = [];
  for (const selected of i.inquiries) {
    const link = (
      await p.find({
        collection: "crm-inquiry-links",
        where: {
          and: [
            { client: { equals: client.id } },
            { inquiry: { equals: selected.inquiryID } },
            { active: { equals: true } },
          ],
        },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    const inquiry = (
      await p.find({
        collection: "inquiries",
        where: { and: [inquiryFilter(actor), { id: { equals: selected.inquiryID } }] },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!link || !inquiry || relationID(inquiry.team) !== team) throw unavailable();
    const cases = await p.find({
      collection: "service-cases",
      where: { inquiry: { equals: inquiry.id } },
      depth: 0,
      limit: 2,
      req,
    });
    if (cases.docs.length > 1) throw new CrmError("服务单归属异常，请联系管理员核对", 503);
    const service = cases.docs[0] ?? null;
    if (
      !replay &&
      (inquiry.status === "closed" ||
        (service && ["completed", "cancelled"].includes(service.stage)) ||
        inquiry.updatedAt !== selected.expectedUpdatedAt ||
        (relationID(inquiry.owner) ?? null) !== selected.expectedOwnerID ||
        (service?.revision ?? null) !== selected.expectedCaseRevision)
    )
      throw conflict();
    items.push({ inquiry, service });
  }
  return { client, items };
}
export interface TransferMutation {
  result: Omit<TransferReceipt, "transferID">;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
export async function applyTransfer(
  p: Payload,
  actor: CrmActor,
  i: TransferInput,
  ctx: TransferContext,
  req: Partial<PayloadRequest>,
): Promise<TransferMutation> {
  if (!isManager(actor)) throw new CrmError("需要客户转交管理权限", 403);
  const client = ctx.client,
    changedClient = i.transferClient && relationID(client.owner) !== i.recipientID;
  const changed = ctx.items.filter((x) => relationID(x.inquiry.owner) !== i.recipientID);
  if (!changedClient && !changed.length) throw conflict();
  const inquiryVersions: Record<string, unknown>[] = [];
  for (const { inquiry, service } of changed) {
    const saved = await p.update({
      collection: "inquiries",
      id: inquiry.id,
      data: { owner: i.recipientID },
      req,
    });
    inquiryVersions.push({
      inquiryID: saved.id,
      ownerID: relationID(saved.owner) ?? null,
      updatedAt: saved.updatedAt,
      caseRevision: service?.revision ?? null,
    });
  }
  const savedClient = await p.update({
    collection: "crm-clients",
    id: client.id,
    data: { ...(changedClient ? { owner: i.recipientID } : {}), revision: client.revision + 1 },
    req,
  });
  const result = {
    clientID: client.id,
    revision: client.revision + 1,
    transferredClient: changedClient,
    inquiryIDs: changed.map((x) => x.inquiry.id),
  };
  return {
    result,
    before: {
      schema: 1,
      client: { ownerID: relationID(client.owner) ?? null, revision: client.revision },
      inquiries: changed.map(({ inquiry, service }) => ({
        inquiryID: inquiry.id,
        ownerID: relationID(inquiry.owner) ?? null,
        updatedAt: inquiry.updatedAt,
        caseRevision: service?.revision ?? null,
      })),
    },
    after: {
      schema: 1,
      ...result,
      recipientID: i.recipientID,
      reason: i.reason,
      client: { ownerID: relationID(savedClient.owner) ?? null, revision: savedClient.revision },
      inquiries: inquiryVersions,
    },
  };
}
