import { supportAuth } from "@/server/support/auth";
import { operationsReport, addSupportReview, retentionAction } from "@/server/support/operations";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
const headers = { "Cache-Control": "no-store" };
export async function GET(req: Request) {
  try {
    const { p, user } = await supportAuth(req.headers);
    return Response.json(await operationsReport(p, user), { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    const input = await limitedJSON(req, 8000);
    return Response.json(
      await (input.action === "review"
        ? addSupportReview(p, user, input)
        : retentionAction(p, user, input)),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
