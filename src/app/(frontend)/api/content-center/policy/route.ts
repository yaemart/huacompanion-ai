import { contentAuth, failure } from "@/server/content/auth";
import { readPolicyEditor } from "@/server/immigration/editor";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
export async function GET(req: Request) {
  if (!visaCheckerEnabled())
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const { p, user } = await contentAuth(req.headers);
    const id = new URL(req.url).searchParams.get("id");
    return Response.json(await readPolicyEditor(p, user, id === null ? undefined : Number(id)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
