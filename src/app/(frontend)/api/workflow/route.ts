import { getPayload } from "payload";
import config from "@/payload.config";
import { isActiveStaff } from "@/cms/access";
import { workflowRead, workflowAction } from "@/server/workflow/service";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { ContentError } from "@/server/content/service";
async function auth(req: Request) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers: req.headers });
  if (user?.collection !== "staff" || !isActiveStaff(user))
    throw new ContentError("请先登录员工账号", 403);
  return { p, user };
}
export async function GET(req: Request) {
  try {
    const { p, user } = await auth(req);
    return Response.json(await workflowRead(p, user), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await auth(req);
    return Response.json(await workflowAction(p, user, await limitedJSON(req, 8000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
