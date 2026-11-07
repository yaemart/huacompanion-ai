import { contentAuth, checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { qualityDesk, reviewQuality } from "@/server/quality/service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { p, user } = await contentAuth(req.headers);
    return Response.json(await qualityDesk(p, user), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    const input = await limitedJSON(req, 15000);
    if (!Number.isSafeInteger(input.draftId) || input.draftId < 1) throw Error("Invalid draft");
    await reviewQuality(p, user, input.draftId, input);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
