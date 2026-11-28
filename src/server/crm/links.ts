import type { Payload, PayloadRequest, Where } from "payload";
import type { CrmClient } from "../../../payload-types";
import { inquiryScope, relationID } from "../../cms/access";
import { CrmError, type CrmInput } from "../../lib/crm";
import { unavailable, type CrmActor } from "./access";

export function inquiryFilter(actor: CrmActor): Where {
  const scope = inquiryScope(actor);
  return scope === true ? {} : scope || { id: { equals: -1 } };
}
export async function prepareInquiryLink(
  p: Payload,
  actor: CrmActor,
  client: CrmClient,
  i: CrmInput,
  req: Partial<PayloadRequest>,
) {
  const link = (
    await p.find({
      collection: "crm-inquiry-links",
      where:
        i.action === "linkInquiry"
          ? { inquiry: { equals: i.inquiryID } }
          : { and: [{ id: { equals: i.linkID } }, { client: { equals: client.id } }] },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (i.action === "revokeInquiryLink" && !link) throw unavailable();
  const id = i.action === "linkInquiry" ? i.inquiryID : relationID(link.inquiry);
  const inquiry = (
    await p.find({
      collection: "inquiries",
      where: { and: [inquiryFilter(actor), { id: { equals: id } }] },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (!inquiry) throw unavailable();
  return { link, inquiry };
}
export async function assertNoActiveLinks(
  p: Payload,
  clientID: number,
  req: Partial<PayloadRequest>,
) {
  if (
    (
      await p.find({
        collection: "crm-inquiry-links",
        where: { and: [{ client: { equals: clientID } }, { active: { equals: true } }] },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs.length
  )
    throw new CrmError("客户仍有关联咨询，不能存档", 409);
}
/** Caller holds business→customer locks and has already rechecked both records. */
export async function applyInquiryLink(
  p: Payload,
  actor: CrmActor,
  client: CrmClient,
  i: CrmInput,
  context: Awaited<ReturnType<typeof prepareInquiryLink>>,
  req: Partial<PayloadRequest>,
) {
  const { link, inquiry } = context;
  const conflict = () => new CrmError("关联版本或状态已变化，请核对后重试", 409);
  const at = new Date().toISOString();
  if (i.action === "linkInquiry") {
    if (String(relationID(inquiry.team)) !== String(relationID(client.team))) throw conflict();
    if (link?.active || (link?.revision ?? 0) !== i.expectedLinkRevision) throw conflict();
  } else {
    if (!link?.active || link.revision !== i.expectedRevision) throw conflict();
    const legacy = await p.find({
      collection: "customer-inquiry-links",
      where: { and: [{ inquiry: { equals: inquiry.id } }, { active: { equals: true } }] },
      limit: 1,
      depth: 0,
      req,
    });
    if (legacy.docs.length)
      throw new CrmError("已有客户访问授权，请先由有权员工核对；本次未撤销关联或授权", 409);
  }
  const revision = (link?.revision ?? 0) + 1;
  const data =
    i.action === "linkInquiry"
      ? {
          client: client.id,
          inquiry: inquiry.id,
          active: true,
          revision,
          linkedBy: Number(actor.id),
          linkedAt: at,
          reason: i.reason!,
          revokedBy: null,
          revokedAt: null,
          revocationReason: null,
        }
      : {
          active: false,
          revision,
          revokedBy: Number(actor.id),
          revokedAt: at,
          revocationReason: i.reason!,
        };
  const saved = link
    ? await p.update({ collection: "crm-inquiry-links", id: link.id, data, req })
    : await p.create({
        collection: "crm-inquiry-links",
        data: {
          ...data,
          client: client.id,
          inquiry: inquiry.id,
          active: true,
          revision,
          linkedBy: Number(actor.id),
          linkedAt: at,
          reason: i.reason!,
        },
        req,
      });
  await p.update({
    collection: "crm-clients",
    id: client.id,
    data: { revision: client.revision + 1 },
    req,
  });
  return {
    result: {
      clientID: client.id,
      inquiryID: inquiry.id,
      linkID: saved.id,
      revision,
      clientRevision: client.revision + 1,
    },
    before: {
      clientID: link ? relationID(link.client) : null,
      inquiryID: inquiry.id,
      active: link?.active ?? false,
      linkRevision: link?.revision ?? 0,
      clientRevision: client.revision,
    },
    after: {
      active: saved.active,
      linkedBy: relationID(saved.linkedBy),
      linkedAt: saved.linkedAt,
      revokedBy: relationID(saved.revokedBy) ?? null,
      revokedAt: saved.revokedAt ?? null,
    },
  };
}
