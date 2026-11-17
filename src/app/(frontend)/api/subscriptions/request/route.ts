import { getPayload, ValidationError } from "payload";
import config from "@/payload.config";
import { limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/service";
import { intakeClient, hasIntakeHoneypot } from "@/server/intake-client";
import { intakeAllowed } from "@/server/rate-limit";
import { isSiteLocale } from "@/server/site-config";
import { queueSubscription, SubscriptionInputError } from "@/server/subscriptions";
import { configuredMailEnabled } from "@/server/workflow/mail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (status: number) => Response.json({ ok: status === 202 }, { status, headers });
  const env = process.env;
  const site = URL.parse(env.APP_URL ?? "");
  const privacyVersion = env.PRIVACY_VERSION?.trim();
  if (
    env.SUBSCRIPTIONS_ENABLED !== "true" ||
    env.SUBSCRIPTION_REQUESTS_ENABLED !== "true" ||
    !configuredMailEnabled() ||
    (env.APP_ENV !== "local" && !env.TRUSTED_PROXY) ||
    !privacyVersion ||
    privacyVersion.length > 100 ||
    !site ||
    (site.protocol !== "https:" &&
      !(site.protocol === "http:" && env.APP_ENV === "local" && site.hostname === "127.0.0.1")) ||
    site.username ||
    site.password
  )
    return reply(503);

  if (site.origin !== request.headers.get("origin")) return reply(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return reply(415);

  try {
    const input = await limitedJSON(request, 2048);
    if (hasIntakeHoneypot(input)) return reply(202);
    if (
      !input ||
      typeof input.email !== "string" ||
      typeof input.topic !== "string" ||
      !isSiteLocale(input.locale) ||
      typeof input.sourcePath !== "string" ||
      (input.partnerCode !== undefined && typeof input.partnerCode !== "string") ||
      input.consent !== true ||
      input.privacyVersion !== privacyVersion
    )
      return reply(400);

    const client = intakeClient(request, env, "subscriptions");
    if (client.cookie) Object.assign(headers, { "Set-Cookie": client.cookie });
    if (!(await intakeAllowed(client.key, "subscriptions"))) {
      Object.assign(headers, { "Retry-After": "600" });
      return reply(429);
    }
    const payload = await getPayload({ config });
    if (!(await payload.findGlobal({ slug: "workflow-settings" })).emailEnabled) return reply(503);
    await queueSubscription(payload, { ...input, privacyVersion }, site.origin);
    return reply(202);
  } catch (error) {
    if (error instanceof ContentError) return reply(error.status);
    if (error instanceof SubscriptionInputError || error instanceof ValidationError)
      return reply(400);
    return reply(503);
  }
}
