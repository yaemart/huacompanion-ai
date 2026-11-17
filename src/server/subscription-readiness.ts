import { trialAccess } from "../lib/trial-access";
import { configuredMailEnabled } from "./workflow/mail";

export function subscriptionRequestConfig(env = process.env) {
  const site = URL.parse(env.APP_URL ?? "");
  const privacyVersion = env.PRIVACY_VERSION?.trim();
  const local = env.APP_ENV === "local";
  const access = trialAccess(null, env);
  if (
    env.SUBSCRIPTIONS_ENABLED !== "true" ||
    !["local", "trial", "production"].includes(env.APP_ENV ?? "") ||
    env.SUBSCRIPTION_REQUESTS_ENABLED !== "true" ||
    env.SUBSCRIPTION_MAIL_LINKS_VERIFIED !== "true" ||
    !configuredMailEnabled(env) ||
    !env.WORKFLOW_MAIL_FROM?.trim() ||
    !env.WORKFLOW_MAIL_API_KEY?.trim() ||
    (env.PAYLOAD_SECRET?.length ?? 0) < 32 ||
    access === "maintenance" ||
    access === "unavailable" ||
    !privacyVersion ||
    privacyVersion.length > 100 ||
    !site ||
    (site.protocol !== "https:" &&
      !(site.protocol === "http:" && local && site.hostname === "127.0.0.1")) ||
    site.username ||
    site.password
  )
    return null;
  if (
    (!local || env.TRUSTED_PROXY) &&
    (!["cloudflare", "nginx"].includes(env.TRUSTED_PROXY ?? "") ||
      (env.TRUSTED_PROXY_SECRET?.length ?? 0) < 32)
  )
    return null;
  return { origin: site.origin, privacyVersion };
}
