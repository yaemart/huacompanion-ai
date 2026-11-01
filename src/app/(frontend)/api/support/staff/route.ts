import { supportAuth } from "@/server/support/auth";
import { staffRead, staffAction } from "@/server/support/service";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
const headers = { "Cache-Control": "no-store" };
export async function GET(req: Request) {
  try {
    const { p, user } = await supportAuth(req.headers);
    return Response.json(await staffRead(p, user, new URL(req.url).searchParams.get("id")), {
      headers,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    return Response.json(await staffAction(p, user, await limitedJSON(req, 16000)), { headers });
  } catch (e) {
    return failure(e);
  }
}
