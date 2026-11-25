import { getPayload } from "payload";
import config from "@/payload.config";
import { limitedBody } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { recordSignedCampaignFeedback } from "@/server/subscription-campaign-feedback";
import { verifyFeedbackSignature, parseFeedbackEvent } from "@/lib/subscription-feedback-webhook";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(request: Request) {
  try {
    if (process.env.APP_ENV !== "local" || process.env.SUBSCRIPTION_FEEDBACK_ENABLED !== "true")
      return new Response(null, { status: 404, headers });
    if (!process.env.SUBSCRIPTION_FEEDBACK_SIGNING_SECRET)
      return new Response(null, { status: 503, headers });
    const body = await limitedBody(request, 16384);
    try {
      verifyFeedbackSignature(
        body,
        request.headers,
        process.env.SUBSCRIPTION_FEEDBACK_SIGNING_SECRET,
      );
    } catch {
      throw new ContentError("回执认证失败。", 401);
    }
    let event;
    try {
      event = parseFeedbackEvent(body);
    } catch {
      throw new ContentError("回执内容无效。", 400);
    }
    if (!event) return Response.json({ received: true }, { headers });
    await recordSignedCampaignFeedback(await getPayload({ config }), body, request.headers);
    return Response.json({ received: true }, { headers });
  } catch (error) {
    return new Response(null, {
      status: error instanceof ContentError ? error.status : 503,
      headers,
    });
  }
}
