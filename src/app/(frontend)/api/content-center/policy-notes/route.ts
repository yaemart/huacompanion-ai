import { contentAuth, checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { mutateSharedPolicyNote } from "@/server/immigration/shared-notes-service";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
export async function POST(req: Request) {
  if (!visaCheckerEnabled())
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    await mutateSharedPolicyNote(p, user, await limitedJSON(req));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
