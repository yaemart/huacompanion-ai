import { supportAuth } from "@/server/support/auth";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { reviewProvider } from "@/server/provider-review";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    return Response.json(await reviewProvider(p, user, await limitedJSON(req, 12000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
