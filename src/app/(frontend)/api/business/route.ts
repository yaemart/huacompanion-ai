import { supportAuth } from "@/server/support/auth";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { businessRead, businessAction, businessCaseForInquiry } from "@/server/business/service";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const { p, user } = await supportAuth(req.headers);
    const query = new URL(req.url).searchParams;
    const data = query.has("inquiry")
      ? await businessCaseForInquiry(p, user, query.get("inquiry"))
      : await businessRead(p, user, query.get("id"));
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    // Each of 30 quote items can contain two 2,000-character explanations.
    return Response.json(await businessAction(p, user, await limitedJSON(req, 1000000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
