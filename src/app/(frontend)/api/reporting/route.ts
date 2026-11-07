import { supportAuth } from "@/server/support/auth";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
import { reportingRead, reportingExport } from "@/server/reporting/service";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const { p, user } = await supportAuth(req.headers);
    const params = new URL(req.url).searchParams;
    if (new Set(params.keys()).size !== Array.from(params.keys()).length)
      throw Error("筛选字段重复");
    return Response.json(await reportingRead(p, user, Object.fromEntries(params)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await supportAuth(req.headers);
    const result = await reportingExport(p, user, await limitedJSON(req, 8000));
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="operations.csv"',
        "Cache-Control": "no-store",
        "X-Export-Count": String(result.count),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
