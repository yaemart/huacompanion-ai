import { supportPayload } from "@/server/support/auth";
import { customerSession } from "@/server/customer/service";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { customerBusinessRead, confirmQuote } from "@/server/business/service";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const p = await supportPayload();
    const c = await customerSession(p, req.headers);
    return Response.json(await customerBusinessRead(p, c), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const p = await supportPayload();
    const c = await customerSession(p, req.headers);
    return Response.json(await confirmQuote(p, c, await limitedJSON(req, 5000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
