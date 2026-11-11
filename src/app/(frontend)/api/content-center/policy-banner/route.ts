import { contentAuth, failure } from "@/server/content/auth";
import { contentTransaction } from "@/server/content/service";
import { policyBannerChoicesFor } from "@/server/immigration/banner-picker";

export async function GET(req: Request) {
  try {
    const { p, user } = await contentAuth(req.headers);
    const params = new URL(req.url).searchParams;
    const choices = await contentTransaction(p, (tx) =>
      policyBannerChoicesFor(p, tx, user, params.get("kind") ?? "", params.get("locale")),
    );
    return Response.json({ choices }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
