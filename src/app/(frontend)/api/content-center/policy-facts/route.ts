import { contentAuth, checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { mutateSharedPolicyFacts } from "@/server/immigration/shared-facts-service";
import { relationID } from "@/cms/access";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
export async function POST(req: Request) {
  if (!visaCheckerEnabled())
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    const saved = await mutateSharedPolicyFacts(p, user, await limitedJSON(req));
    return Response.json(
      { groupId: relationID(saved.group) },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
