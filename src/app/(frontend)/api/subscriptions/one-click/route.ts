import { getPayload } from "payload";
import config from "@/payload.config";
import { isSubscriptionToken } from "@/lib/subscription-action";
import { limitedBody } from "@/server/content/auth";
import { ContentError } from "@/server/content/service";
import { unsubscribeSubscription } from "@/server/subscriptions";

export const runtime = "nodejs";

function reply(status: number) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: Request) {
  if (
    process.env.SUBSCRIPTIONS_ENABLED !== "true" ||
    process.env.SUBSCRIPTION_MAIL_LINKS_VERIFIED !== "true"
  )
    return reply(404);
  const token = new URL(request.url).searchParams.get("token");
  if (!isSubscriptionToken(token)) return reply(400);
  const type = request.headers.get("content-type") ?? "";
  if (
    !["application/x-www-form-urlencoded", "multipart/form-data"].includes(
      type.split(";")[0].trim(),
    )
  )
    return reply(415);
  try {
    const body = await limitedBody(request, 2048);
    const form = await new Response(new Uint8Array(body), {
      headers: { "Content-Type": type },
    }).formData();
    if (Array.from(form).length !== 1 || form.get("List-Unsubscribe") !== "One-Click")
      return reply(400);
  } catch (error) {
    return reply(error instanceof ContentError ? error.status : 400);
  }
  try {
    await unsubscribeSubscription(await getPayload({ config }), token);
    return reply(204);
  } catch {
    return reply(503);
  }
}
