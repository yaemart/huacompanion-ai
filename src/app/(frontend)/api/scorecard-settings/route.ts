import { checkOrigin, failure, limitedJSON } from "@/server/content/auth";
import { performanceAuth } from "@/server/performance/auth";
import { changeScorecardSettings } from "@/server/performance/scorecard-settings";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await performanceAuth(req.headers);
    return Response.json(await changeScorecardSettings(p, user, await limitedJSON(req, 300000)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
