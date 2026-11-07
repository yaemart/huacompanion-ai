import { supportPayload, visitorSession } from "@/server/support/auth";
import { submitSatisfaction } from "@/server/support/operations";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    return Response.json(
      await submitSatisfaction(
        await supportPayload(),
        visitorSession(req.headers).hash,
        await limitedJSON(req, 6000),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
