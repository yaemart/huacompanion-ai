import { followupActions, parseFollowupCommand, parseFollowupQuery } from "@/lib/crm-followups";
import { executeFollowup } from "@/server/crm/followups";
import { followupList, followupEvents } from "@/server/crm/followup-read";
import { supportPayload } from "@/server/support/auth";
import { checkOrigin, limitedJSON } from "@/server/content/auth";
import { parseCrmAction } from "@/lib/crm";
import { authenticateCrm } from "@/server/crm/access";
import { crmRead } from "@/server/crm/read";
import { crmAction } from "@/server/crm/service";
import { crmFailure, crmHeaders, crmQuery } from "@/server/crm/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const input = crmQuery(req.url),
      p = await supportPayload();
    const actor = await authenticateCrm(p, req.headers);
    const q = ["followupList", "followupEvents"].includes(String(input.action))
      ? parseFollowupQuery(req.url)
      : undefined;
    const result = q
      ? q.action === "followupEvents"
        ? await followupEvents(p, actor, q.context, q.taskID!, q.page, q.limit)
        : await followupList(p, actor, q.context, q.page, q.limit)
      : await crmRead(p, actor, input);
    return Response.json(result, {
      headers: crmHeaders,
    });
  } catch (e) {
    return crmFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const raw = await limitedJSON(req, 16384);
    const followup =
      raw &&
      typeof raw === "object" &&
      "action" in raw &&
      followupActions.some((a) => a === raw.action);
    const input = followup ? parseFollowupCommand(raw) : parseCrmAction(raw),
      p = await supportPayload();
    const actor = await authenticateCrm(p, req.headers);
    return Response.json(
      followup ? await executeFollowup(p, actor, input) : await crmAction(p, actor, input),
      {
        headers: crmHeaders,
      },
    );
  } catch (e) {
    return crmFailure(e);
  }
}
