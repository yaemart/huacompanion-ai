import { createHash, timingSafeEqual } from "node:crypto";

/** Infrastructure gate only: never grants employee or customer permissions. */
export function trialAccess(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): "disabled" | "allowed" | "unauthorized" | "unavailable" | "maintenance" {
  const required = env.TRIAL_ACCESS_REQUIRED;
  const renderTrial = env.RENDER === "true" && env.APP_ENV === "trial";
  if (required && !["true", "false"].includes(required)) return "unavailable";
  if (required !== "true" && !renderTrial) return "disabled";
  const user = env.TRIAL_ACCESS_USER || "";
  const password = env.TRIAL_ACCESS_PASSWORD || "";
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(user) || password.length < 32 || password.length > 256)
    return "unavailable";
  if (env.TRIAL_MAINTENANCE === "true") return "maintenance";
  if (
    !authorization ||
    authorization.length > 2048 ||
    !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)
  )
    return "unauthorized";
  const supplied = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`${user}:${password}`))
    ? "allowed"
    : "unauthorized";
}
