import type { Payload, PayloadRequest, Where } from "payload";
import { relationID } from "../../cms/access";
import { inquiryFilter } from "./links";
import { requireClient, type CrmActor } from "./access";

export async function readInquiryLinks(
  p: Payload,
  actor: CrmActor,
  input: { clientID: number; action: string; page: number; limit: number; q?: string },
  req: Partial<PayloadRequest>,
) {
  const client = await requireClient(p, actor, input.clientID, req);
  if (input.action === "inquiryCandidates") {
    const occupied = await p.find({
      collection: "crm-inquiry-links",
      where: { active: { equals: true } },
      pagination: false,
      depth: 0,
      select: { inquiry: true },
      req,
    });
    const ids = occupied.docs.map((d) => relationID(d.inquiry)!);
    const where: Where[] = [inquiryFilter(actor), { team: { equals: relationID(client.team) } }];
    if (ids.length) where.push({ id: { not_in: ids } });
    if (input.q)
      where.push({ or: [{ reference: { contains: input.q } }, { name: { contains: input.q } }] });
    const inquiries = await p.find({
      collection: "inquiries",
      where: { and: where },
      depth: 0,
      page: input.page,
      limit: input.limit,
      sort: ["-createdAt", "-id"],
      select: { reference: true, name: true, status: true },
      req,
    });
    const pageIDs = inquiries.docs.map((d) => d.id);
    const previous = pageIDs.length
      ? await p.find({
          collection: "crm-inquiry-links",
          where: { inquiry: { in: pageIDs } },
          pagination: false,
          depth: 0,
          select: { inquiry: true, revision: true },
          req,
        })
      : { docs: [] };
    const versions = new Map(previous.docs.map((d) => [Number(relationID(d.inquiry)), d.revision]));
    return {
      items: inquiries.docs.map((d) => ({
        inquiryID: d.id,
        reference: d.reference,
        name: d.name,
        status: d.status,
        expectedLinkRevision: versions.get(d.id) ?? 0,
      })),
      total: inquiries.totalDocs,
      page: input.page,
      limit: input.limit,
    };
  }
  const visible = await p.find({
    collection: "inquiries",
    where: inquiryFilter(actor),
    pagination: false,
    depth: 0,
    select: { reference: true, name: true, status: true },
    req,
  });
  const ids = visible.docs.map((d) => d.id);
  if (!ids.length) return { items: [], total: 0, page: input.page, limit: input.limit };
  const links = await p.find({
    collection: "crm-inquiry-links",
    where: {
      and: [
        { client: { equals: client.id } },
        { active: { equals: true } },
        { inquiry: { in: ids } },
      ],
    },
    page: input.page,
    limit: input.limit,
    sort: ["-createdAt", "-id"],
    depth: 0,
    req,
  });
  const inquiryIDs = links.docs.map((d) => Number(relationID(d.inquiry)));
  const cases = inquiryIDs.length
    ? await p.find({
        collection: "service-cases",
        where: { inquiry: { in: inquiryIDs } },
        pagination: false,
        depth: 0,
        select: { inquiry: true, title: true, stage: true },
        req,
      })
    : { docs: [] };
  const byInquiry = new Map(visible.docs.map((d) => [d.id, d]));
  const byCase = new Map(cases.docs.map((d) => [Number(relationID(d.inquiry)), d]));
  return {
    items: links.docs.map((d) => {
      const id = Number(relationID(d.inquiry)),
        inquiry = byInquiry.get(id)!,
        service = byCase.get(id);
      return {
        linkID: d.id,
        linkRevision: d.revision,
        clientRevision: client.revision,
        inquiryID: id,
        reference: inquiry.reference,
        name: inquiry.name,
        status: inquiry.status,
        serviceCase: service
          ? { id: service.id, title: service.title, stage: service.stage }
          : null,
      };
    }),
    total: links.totalDocs,
    page: input.page,
    limit: input.limit,
  };
}
