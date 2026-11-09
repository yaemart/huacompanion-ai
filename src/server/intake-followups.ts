import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { isOperator, type Staff } from "../cms/access";
import { sql } from "@payloadcms/db-postgres";
import { executeSQL } from "./db-types";
import { followUps, followupInput } from "../lib/intake-followups";
import { businessTransaction } from "./business/service";
import { ContentError } from "./content/service";
export async function appendIntakeFollowup(p: Payload, user: Staff, input: unknown) {
  let command: ReturnType<typeof followupInput>;
  try {
    command = followupInput(input);
  } catch (e) {
    throw new ContentError((e as Error).message);
  }
  if (!isOperator(user)) throw new ContentError("需要业务运营权限", 403);
  return businessTransaction(p, async (req) => {
    const actor = await p.findByID({ collection: "staff", id: user!.id, depth: 0, req });
    if (!isOperator(actor)) throw new ContentError("员工权限已撤销", 403);
    const record = await p
      .findByID({
        collection: command.kind,
        id: command.id,
        user: actor,
        overrideAccess: false,
        depth: 0,
        req,
      })
      .catch((error: unknown) => {
        if ([403, 404].includes((error as { status: number }).status))
          throw new ContentError("无权处理这条记录，或记录不存在", 403);
        throw error;
      });
    const rows = followUps(record.followUps);
    const prior = rows.find((r) => r.key === command.key);
    if (prior) {
      if (prior.body !== command.body || prior.actor !== String(actor.id))
        throw new ContentError("该提交编号已用于其他跟进，请重新输入", 409);
      return { followUps: rows };
    }
    const row = {
      id: randomUUID(),
      key: command.key,
      body: command.body,
      at: new Date().toISOString(),
      actor: String(actor.id),
      actorName: actor.name,
    };
    const history = [...rows, row];
    const saved = await executeSQL(
      p,
      (await req.transactionID)!,
      sql`UPDATE ${sql.identifier(command.kind)} SET follow_ups=${JSON.stringify(history)}::jsonb WHERE id=${record.id} RETURNING id`,
    );
    if (!saved.rows.length) throw new ContentError("记录已不存在，请重新打开列表", 409);
    await p.create({
      collection: "audit-events",
      overrideAccess: true,
      user: actor,
      req,
      data: {
        entity: command.kind,
        recordId: String(record.id),
        action: "followup-appended",
        actor: actor.id,
        fields: "followUps",
        after: { followupId: row.id },
      },
    });
    return { followUps: history };
  });
}
