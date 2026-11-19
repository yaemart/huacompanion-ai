import { limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { campaignStaffAuth } from "@/server/subscription-campaign-workspace";
import { setCampaignGrant } from "@/server/subscription-campaign-access";
import { saveCampaignDraft } from "@/server/subscription-campaign-drafts";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export async function POST(request: Request) {
  try {
    const { p, user } = await campaignStaffAuth(request.headers);
    if (URL.parse(process.env.APP_URL ?? "")?.origin !== request.headers.get("origin"))
      throw new ContentError("请从华伴政策群发草稿页重新打开后操作。", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      throw new ContentError("请使用页面上的保存或授权按钮。", 415);
    const body: unknown = await limitedJSON(request, 16384);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["action", "input"].includes(key)) ||
      !("action" in body) ||
      !("input" in body)
    )
      throw new ContentError("操作内容无效，请重新打开页面。", 400);
    if (body.action === "grant") {
      await setCampaignGrant(p, user, body.input as Parameters<typeof setCampaignGrant>[2]);
      return Response.json({ updated: true }, { headers });
    }
    if (body.action !== "save") throw new ContentError("请选择保存草稿或更新授权。", 400);
    const result = await saveCampaignDraft(p, user, body.input);
    return Response.json({ campaignKey: result.campaignKey }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ContentError
            ? error.message
            : "操作未完成，当前填写已保留，请稍后重试。",
      },
      { status: error instanceof ContentError ? error.status : 503, headers },
    );
  }
}
