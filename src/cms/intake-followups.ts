import type { CollectionBeforeChangeHook, Field } from "payload";
import { Forbidden } from "payload";
import { sql } from "@payloadcms/db-postgres";
import { isOperator } from "./access";
import { executeSQL } from "../server/db-types";
export const followupField: Field = {
  name: "followUps",
  label: "内部跟进记录（只能追加）",
  type: "json",
  admin: { readOnly: true, components: { Field: "/cms/FollowUpTimeline#FollowUpTimeline" } },
  access: { create: () => false, update: () => false },
};
export const guardIntakeFollowups: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
  collection,
}) => {
  if (
    "followUps" in data &&
    JSON.stringify(data.followUps ?? null) !== JSON.stringify(originalDoc?.followUps ?? null)
  )
    throw Error("跟进历史只能通过“追加跟进”保存，不可覆盖或删除");
  if (operation === "update" && "notes" in data && data.notes !== originalDoc.notes)
    throw Error("旧备注已留档，请使用“追加跟进”，不能覆盖旧记录");
  if (operation === "create" && data.notes)
    data.followUps = [{ id: "legacy", body: data.notes, legacy: true }];
  if (operation === "update") {
    const id = await req.transactionID;
    if (!id || !["inquiries", "providers"].includes(collection.slug))
      throw Error("跟进保护需要数据库事务");
    if (isOperator(req.user)) {
      const actor = await req.payload.findByID({
        collection: "staff",
        id: req.user!.id,
        depth: 0,
        req,
      });
      if (!isOperator(actor)) throw new Forbidden();
      await req.payload.findByID({
        collection: collection.slug,
        id: originalDoc.id,
        user: actor,
        overrideAccess: false,
        depth: 0,
        req,
      });
    }
    const result = await executeSQL(
      req.payload,
      id,
      sql`SELECT follow_ups FROM ${sql.identifier(collection.slug)} WHERE id=${originalDoc.id} FOR UPDATE`,
    );
    if (!result.rows[0]) throw Error("记录已不存在，请重新打开列表");
    data.followUps = result.rows[0].follow_ups;
  }
  return data;
};
