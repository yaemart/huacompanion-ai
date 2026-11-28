import { isAdmin, isManager, relationID as staffRelationID } from "../../cms/access";
import { readInquiryLinks } from "./link-read";
import type { Payload, PayloadRequest, Where } from "payload";
import { relationID } from "../../cms/access";
import { CrmError, crmID } from "../../lib/crm";
import { transactionSession } from "../db-types";
import { clientScope, currentActor, requireClient, type CrmActor } from "./access";

export async function crmRead(p: Payload, user: CrmActor, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CrmError("查询无效");
  const input = raw as Record<string, unknown>;
  const action = input.action;
  if (
    !["list", "get", "contacts", "linkedInquiries", "inquiryCandidates", "options"].includes(
      String(action),
    )
  )
    throw new CrmError("查询操作无效");
  const allowed =
    action === "options"
      ? ["action"]
      : action === "linkedInquiries"
        ? ["action", "clientID", "page", "limit"]
        : action === "inquiryCandidates"
          ? ["action", "clientID", "page", "limit", "q"]
          : action === "get"
            ? ["action", "clientID"]
            : action === "contacts"
              ? ["action", "clientID", "status", "page", "limit"]
              : ["action", "q", "status", "page", "limit"];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new CrmError("查询包含未允许字段");
  const clientID = action === "list" || action === "options" ? undefined : crmID(input.clientID);
  const page = input.page === undefined ? 1 : crmID(input.page);
  const limit = input.limit === undefined ? 20 : crmID(input.limit);
  if (limit > 50 || page > 100000) throw new CrmError("分页超出范围");
  if (input.q !== undefined && (typeof input.q !== "string" || input.q.length > 100))
    throw new CrmError("搜索文字过长");
  const status = input.status ?? "active";
  if (status !== "active" && status !== "archived") throw new CrmError("状态无效");
  const id = await p.db.beginTransaction();
  if (!id) throw new Error("Transaction required");
  try {
    const db = transactionSession(p, id).db;
    await db.execute("SET TRANSACTION READ ONLY");
    await db.execute("SELECT pg_advisory_xact_lock(726281)");
    await db.execute("SELECT pg_advisory_xact_lock(726283)");
    const req: Partial<PayloadRequest> = { transactionID: id };
    const actor = await currentActor(p, user, req);
    if (action === "options") {
      const admin = isAdmin(actor),
        manager = isManager(actor),
        teamID = staffRelationID(actor.team);
      const teams = await p.find({
        collection: "teams",
        where: admin ? {} : { id: { equals: teamID ?? -1 } },
        pagination: false,
        depth: 0,
        select: { name: true },
        req,
      });
      const owners = await p.find({
        collection: "staff",
        where: {
          and: [
            { active: { not_equals: false } },
            {
              or: [
                { role: { equals: "operations" } },
                { additionalRoles: { contains: "operations" } },
              ],
            },
            { team: { in: teams.docs.map((t) => t.id) } },
          ],
        },
        pagination: false,
        depth: 0,
        select: { name: true, team: true },
        req,
      });
      await p.db.commitTransaction(id);
      return {
        role: admin ? ("admin" as const) : manager ? ("manager" as const) : ("operations" as const),
        teamID: teamID ?? null,
        teams: teams.docs.map((t) => ({ id: t.id, name: t.name })),
        owners: (admin || manager ? owners.docs : []).map((s) => ({
          id: s.id,
          name: s.name,
          teamID: staffRelationID(s.team),
        })),
      };
    }
    if (action === "linkedInquiries" || action === "inquiryCandidates") {
      const result = await readInquiryLinks(
        p,
        actor,
        {
          action,
          clientID: clientID!,
          page,
          limit,
          q: typeof input.q === "string" ? input.q.trim() : undefined,
        },
        req,
      );
      await p.db.commitTransaction(id);
      return result;
    }
    if (action === "get") {
      const doc = await requireClient(p, actor, clientID!, req);
      await p.db.commitTransaction(id);
      return clientDTO(doc);
    }
    if (action === "contacts") {
      await requireClient(p, actor, clientID!, req);
      const result = await p.find({
        collection: "crm-contacts",
        where: { and: [{ client: { equals: clientID } }, { status: { equals: status } }] },
        depth: 0,
        page,
        limit,
        sort: ["-createdAt", "-id"],
        req,
      });
      const items = result.docs.map((d) => ({
        id: d.id,
        clientID: relationID(d.client),
        name: d.name,
        email: d.email ?? null,
        phone: d.phone ?? null,
        jobTitle: d.jobTitle ?? null,
        isPrimary: d.isPrimary,
        status: d.status,
        revision: d.revision,
      }));
      await p.db.commitTransaction(id);
      return { items, total: result.totalDocs, page, limit };
    }
    const where: Where[] = [clientScope(actor), { status: { equals: status } }];
    const q = typeof input.q === "string" ? input.q.trim() : "";
    if (q) where.push({ or: [{ reference: { contains: q } }, { displayName: { contains: q } }] });
    const result = await p.find({
      collection: "crm-clients",
      where: { and: where },
      depth: 0,
      page,
      limit,
      sort: ["-createdAt", "-id"],
      req,
    });
    await p.db.commitTransaction(id);
    return { items: result.docs.map(clientDTO), total: result.totalDocs, page, limit };
  } catch (error) {
    await p.db.rollbackTransaction(id);
    throw error;
  }
}
function clientDTO(d: import("../../../payload-types").CrmClient) {
  return {
    id: d.id,
    reference: d.reference,
    kind: d.kind,
    displayName: d.displayName,
    language: d.language,
    countryCode: d.countryCode ?? null,
    teamID: relationID(d.team),
    ownerID: relationID(d.owner) ?? null,
    status: d.status,
    revision: d.revision,
    createdAt: d.createdAt,
  };
}
