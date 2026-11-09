import { supportAuth } from "@/server/support/auth";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { appendIntakeFollowup } from "@/server/intake-followups";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    return Response.json(await appendIntakeFollowup(p, user, await limitedJSON(req, 50000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
