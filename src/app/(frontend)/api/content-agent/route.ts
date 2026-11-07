import { contentAuth, checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { agentAction } from "@/server/content-agent/service";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    return Response.json(await agentAction(p, user, await limitedJSON(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
