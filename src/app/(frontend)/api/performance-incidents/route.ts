import { checkOrigin, failure, limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { performanceAuth } from "@/server/performance/auth";
import { performanceRead, performanceAction } from "@/server/performance/service";
import { sourceChoices } from "@/server/performance/sources";
import { incidentSources } from "@/lib/performance-incidents";
import { inquiryCaseID } from "@/lib/intake-case";

const cache = { headers: { "Cache-Control": "private, no-store" } };
export async function GET(req: Request) {
  try {
    const { p, user } = await performanceAuth(req.headers);
    const query = new URL(req.url).searchParams;
    if (query.has("source")) {
      const source = incidentSources.find((value) => value === query.get("source"));
      const record = inquiryCaseID(query.get("record"));
      if (!source || !record) throw new ContentError("请从原记录重新打开登记入口。", 404);
      return Response.json({ choices: await sourceChoices(p, user, source, record) }, cache);
    }
    const record = inquiryCaseID(query.get("id"));
    if (query.has("id") && !record) throw new ContentError("请从工作台重新打开记录。", 404);
    return Response.json(await performanceRead(p, user, record), cache);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await performanceAuth(req.headers);
    return Response.json(await performanceAction(p, user, await limitedJSON(req, 40000)), cache);
  } catch (error) {
    return failure(error);
  }
}
