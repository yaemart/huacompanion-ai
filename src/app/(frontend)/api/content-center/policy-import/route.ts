import { checkOrigin, contentAuth, failure, limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { importPolicyCsv } from "@/server/immigration/csv-import";

export async function POST(req: Request) {
  if (!visaCheckerEnabled())
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    checkOrigin(req);
    const { p, user } = await contentAuth(req.headers);
    const input = await limitedJSON(req, 1600000);
    if (typeof input?.csv !== "string" || typeof input.save !== "boolean")
      throw new ContentError("请选择有效的 CSV 文件");
    if (Buffer.byteLength(input.csv, "utf8") > 250000)
      throw new ContentError("文件超过 250 KB，请拆分后再试。", 413);
    return Response.json(await importPolicyCsv(p, user, input.csv, input.save), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
