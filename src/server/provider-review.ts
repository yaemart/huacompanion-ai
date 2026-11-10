import type { Payload } from "payload";
import { isManager, relationID, type Staff } from "../cms/access";
import { providerReviewToken } from "../cms/provider-review";
import { providerReviewInput } from "../lib/provider-review";
import { ContentError } from "./content/error";
import { transactionSession } from "./db-types";
export async function reviewProvider(p: Payload, user: Staff, input: unknown) {
  let command: ReturnType<typeof providerReviewInput>;
  try {
    command = providerReviewInput(input);
  } catch (e) {
    throw new ContentError((e as Error).message);
  }
  if (!isManager(user)) throw new ContentError("需要业务主管或管理员审核", 403);
  const transactionID = await p.db.beginTransaction();
  if (!transactionID) throw Error("审核需要数据库事务");
  const req = { transactionID };
  try {
    const db = transactionSession(p, transactionID).db;
    await db.execute("SELECT pg_advisory_xact_lock(726271)");
    await db.execute("SELECT pg_advisory_xact_lock(726281)");
    const actor = await p.findByID({ collection: "staff", id: user!.id, depth: 0, req });
    if (!isManager(actor)) throw new ContentError("审核权限已撤销", 403);
    const provider = await p
      .findByID({
        collection: "providers",
        id: command.id,
        user: actor,
        overrideAccess: false,
        depth: 0,
        req,
      })
      .catch((e: unknown) => {
        if ([403, 404].includes((e as { status: number }).status))
          throw new ContentError("无权审核这条申请，或申请不存在", 403);
        throw e;
      });
    const action = `provider-review:${command.key}`;
    const prior = (
      await p.find({
        collection: "audit-events",
        depth: 0,
        limit: 1,
        req,
        where: {
          and: [
            { entity: { equals: "providers" } },
            { recordId: { equals: String(provider.id) } },
            { action: { equals: action } },
          ],
        },
      })
    ).docs[0];
    if (prior) {
      const after = prior.after as {
        reason: string;
        status: string;
        base: string;
        updatedAt: string;
      };
      if (
        String(relationID(prior.actor)) !== String(actor.id) ||
        after.reason !== command.reason ||
        after.status !== command.status ||
        after.base !== command.updatedAt
      )
        throw new ContentError("该提交编号已用于其他审核，请重新填写", 409);
      if (provider.updatedAt !== after.updatedAt)
        throw new ContentError("原审核已记录，资料之后又有修改，请刷新后核对", 409);
      await p.db.commitTransaction(transactionID);
      return {
        status: provider.status,
        publicApproved: !!provider.publicApproved,
        updatedAt: provider.updatedAt,
        duplicate: true,
      };
    }
    if (provider.updatedAt !== command.updatedAt)
      throw new ContentError("资料已被修改，请刷新、核对后重新审核", 409);
    const saved = await p.update({
      collection: "providers",
      id: provider.id,
      user: actor,
      req,
      overrideAccess: true,
      context: { providerReview: providerReviewToken },
      data: {
        status: command.status,
        ...(command.status === "paused" ? { publicApproved: false } : {}),
      },
    });
    await p.create({
      collection: "audit-events",
      user: actor,
      req,
      data: {
        entity: "providers",
        recordId: String(provider.id),
        action,
        actor: actor.id,
        fields: "status, publicApproved",
        before: { status: provider.status, publicApproved: !!provider.publicApproved },
        after: {
          status: saved.status,
          publicApproved: !!saved.publicApproved,
          reason: command.reason,
          base: command.updatedAt,
          updatedAt: saved.updatedAt,
        },
      },
    });
    await p.db.commitTransaction(transactionID);
    return {
      status: saved.status,
      publicApproved: !!saved.publicApproved,
      updatedAt: saved.updatedAt,
      duplicate: false,
    };
  } catch (e) {
    await p.db.rollbackTransaction(transactionID);
    throw e;
  }
}
