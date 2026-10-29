import { Forbidden } from "payload";
import type { CollectionBeforeChangeHook } from "payload";
import { hasRole, isAdmin, isManager, relationID } from "./access.ts";

export const authorityFields = ["role", "additionalRoles", "active", "team", "contentKinds"] as const;
export function authorityChanged(data: Record<string, unknown>, original: Record<string, unknown>): boolean {
  return authorityFields.some((field) => field in data && JSON.stringify(data[field]) !== JSON.stringify(original[field]));
}
export function validOwner(owner: Parameters<typeof hasRole>[0], team: unknown): boolean {
  const teamID = relationID(team);
  return hasRole(owner, "operations") && teamID !== undefined && String(relationID(owner?.team)) === String(teamID);
}

/** Serializes authority edits so concurrent administrators cannot remove the last admin. */
async function staffLock(req: any) {
  const transactionID = await req.transactionID;
  if (transactionID && req.payload.db.sessions?.[transactionID])
    await req.payload.db.sessions[transactionID].db.execute("SELECT pg_advisory_xact_lock(726272)");
}
export const guardStaffChange: CollectionBeforeChangeHook = async ({ req, operation, data, originalDoc }) => {
  if (operation === "create" && !isAdmin(req.user) && req.context.allowLocalStaffSetup !== true) throw new Forbidden();
  if (operation === "update" && authorityChanged(data, originalDoc)) {
    await staffLock(req);
    if (!isAdmin(req.user)) throw new Forbidden();
    if (isAdmin(originalDoc) && !isAdmin({ ...originalDoc, ...data })) {
      const others = await req.payload.find({
        collection: "staff", req, overrideAccess: true, depth: 0, pagination: false,
        where: { and: [{ id: { not_equals: originalDoc.id } }, { or: [{ role: { equals: "admin" } }, { additionalRoles: { contains: "admin" } }] }] },
      });
      if (!others.docs.some((staff) => isAdmin(staff))) throw new Error("必须保留至少一位启用的管理员。");
    }
    // Payload's JWT strategy reads the DB user and verifies sid against sessions on every request.
    data.sessions = [];
  }
  return data;
};

export const guardBusinessAssignment: CollectionBeforeChangeHook = async ({ req, data, originalDoc }) => {
  const changingTeam = "team" in data && String(relationID(data.team)) !== String(relationID(originalDoc?.team));
  const changingOwner = "owner" in data && String(relationID(data.owner)) !== String(relationID(originalDoc?.owner));
  if (!changingTeam && !changingOwner) return data;
  if (changingTeam && !isAdmin(req.user)) throw new Forbidden();
  const team = "team" in data ? data.team : originalDoc?.team;
  if (changingOwner && !isAdmin(req.user)) {
    const actorTeam = relationID(req.user?.team);
    if (!isManager(req.user) || actorTeam === undefined || String(actorTeam) !== String(relationID(team))) throw new Forbidden();
  }
  const ownerID = relationID("owner" in data ? data.owner : originalDoc?.owner);
  if (ownerID !== undefined) {
    const owner = await req.payload.findByID({ collection: "staff", id: ownerID, req, overrideAccess: true, depth: 0 });
    if (!validOwner(owner, team)) throw new Error("负责人必须是本团队已启用的客户运营员工。");
  }
  return data;
};
