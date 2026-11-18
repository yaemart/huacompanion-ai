import {
  subscriptionAdminAuth,
  readSubscriptionManagement,
} from "@/server/subscription-management";
import { ContentError } from "@/server/content/error";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export async function GET(request: Request) {
  try {
    const { p, user } = await subscriptionAdminAuth(request.headers);
    const query = new URL(request.url).searchParams;
    if (query.size !== new Set(query.keys()).size)
      throw new ContentError("筛选条件重复，请重新选择。");
    return Response.json(await readSubscriptionManagement(p, user, Object.fromEntries(query)), {
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof ContentError ? error.message : "订阅资料暂时无法读取，请稍后重试。",
      },
      { status: error instanceof ContentError ? error.status : 503, headers },
    );
  }
}
