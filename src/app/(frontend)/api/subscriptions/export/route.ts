import { limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { subscriptionAdminAuth } from "@/server/subscription-management";
import { exportSubscriptionCsv } from "@/server/subscription-export";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export async function POST(request: Request) {
  try {
    const { p, user } = await subscriptionAdminAuth(request.headers);
    const site = URL.parse(process.env.APP_URL ?? "");
    if (!site || site.origin !== request.headers.get("origin"))
      throw new ContentError("请从华伴订阅管理页重新打开后再导出。", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      throw new ContentError("请使用订阅管理页的 CSV 导出按钮。", 415);
    const result = await exportSubscriptionCsv(p, user, await limitedJSON(request, 2048));
    return new Response(result.csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Count": String(result.count),
        "X-Export-As-Of": result.asOf,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof ContentError ? error.message : "订阅导出暂时无法完成，请稍后重试。",
      },
      { status: error instanceof ContentError ? error.status : 503, headers },
    );
  }
}
