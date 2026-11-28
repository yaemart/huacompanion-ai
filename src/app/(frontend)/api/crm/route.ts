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
    return Response.json(await crmRead(p, await authenticateCrm(p, req.headers), input), {
      headers: crmHeaders,
    });
  } catch (e) {
    return crmFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const input = parseCrmAction(await limitedJSON(req, 16384)),
      p = await supportPayload();
    return Response.json(await crmAction(p, await authenticateCrm(p, req.headers), input), {
      headers: crmHeaders,
    });
  } catch (e) {
    return crmFailure(e);
  }
}
