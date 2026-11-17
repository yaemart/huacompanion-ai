export type SubscriptionAction = "confirm" | "unsubscribe";

export function isSubscriptionToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Keep the bearer value out of the URL delivered to the web server. */
export function subscriptionActionURL(
  origin: string,
  action: SubscriptionAction,
  locale: string,
  token: string,
) {
  const url = new URL("/email-subscription", origin);
  url.searchParams.set("action", action);
  url.searchParams.set("lang", locale === "zh" ? "zh" : "en");
  url.hash = new URLSearchParams({ token }).toString();
  return url;
}
