import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isSubscriptionToken, type SubscriptionAction } from "@/lib/subscription-action";
import { limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/service";
import { confirmSubscription, unsubscribeSubscription } from "@/server/subscriptions";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const copy = {
  zh: {
    confirm: "确认订阅",
    unsubscribe: "退订此主题",
    ready: "请点击下方按钮完成操作。",
    invalid: "此链接已失效或已使用，请检查邮件中的最新链接。",
    confirmed: "订阅已确认。",
    unsubscribed: "已退订此主题。",
    retry: "暂时无法完成，请稍后重试。",
    noScript: "请允许 JavaScript，再从邮件中重新打开链接。",
  },
  en: {
    confirm: "Confirm subscription",
    unsubscribe: "Unsubscribe from this topic",
    ready: "Select the button below to continue.",
    invalid: "This link has expired or has already been used. Check your latest email.",
    confirmed: "Your subscription is confirmed.",
    unsubscribed: "You have unsubscribed from this topic.",
    retry: "We could not complete this request. Try again shortly.",
    noScript: "Enable JavaScript and reopen the link from your email.",
  },
};

function actionFor(request: Request): SubscriptionAction | undefined {
  if (process.env.SUBSCRIPTIONS_ENABLED !== "true") return;
  const action = new URL(request.url).searchParams.get("action");
  if (action === "confirm" || action === "unsubscribe") return action;
}

function reply(status: number) {
  return Response.json({ ok: status === 200 }, { status, headers });
}

export function GET(request: Request) {
  const action = actionFor(request);
  if (!action) return reply(404);
  const lang = new URL(request.url).searchParams.get("lang") === "zh" ? "zh" : "en";
  const text = copy[lang];
  const success = action === "confirm" ? text.confirmed : text.unsubscribed;
  const nonce = randomBytes(16).toString("base64");
  return new Response(
    `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text[action]} · Hua Companion</title>
<style nonce="${nonce}">
  body { margin: 0; color: #183e35; background: #fafcf9; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 38rem; margin: 10vh auto; padding: 0 1.5rem; }
  button { background: #183e35; color: white; font: inherit; min-height: 44px; padding: 0.6rem 1rem; border: 0; border-radius: 6px; }
  button:disabled { opacity: 0.55; }
</style>
</head>
<body><main>
<h1>${text[action]}</h1>
<p id="feedback" role="status"
  data-ready="${text.ready}" data-invalid="${text.invalid}"
  data-success="${success}" data-retry="${text.retry}">${text.ready}</p>
<button id="subscription-action" type="button" disabled>${text[action]}</button>
<noscript><p>${text.noScript}</p></noscript>
</main>
<script nonce="${nonce}">
(() => {
  const target = "/email-subscription?action=${action}&lang=${lang}";
  const button = document.getElementById("subscription-action");
  const feedback = document.getElementById("feedback");
  let link;
  function readLink() {
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    if (location.hash) history.replaceState(null, "", target);
    link = /^[0-9a-f]{64}$/.test(token || "") ? { token } : null;
    feedback.textContent = link ? feedback.dataset.ready : feedback.dataset.invalid;
    button.disabled = !link;
  }
  window.addEventListener("hashchange", readLink);
  readLink();
  button.addEventListener("click", async () => {
    const activeLink = link;
    if (!activeLink || button.disabled) return;
    button.disabled = true;
    try {
      const response = await fetch(target, {
        method: "POST",
        credentials: "same-origin",
        mode: "same-origin",
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: activeLink.token }),
      });
      if (link !== activeLink) return;
      if (response.ok) {
        feedback.textContent = feedback.dataset.success;
      } else if (response.status >= 500) {
        feedback.textContent = feedback.dataset.retry;
        button.disabled = false;
      } else {
        feedback.textContent = feedback.dataset.invalid;
      }
    } catch {
      if (link !== activeLink) return;
      feedback.textContent = feedback.dataset.retry;
      button.disabled = false;
    }
  });
})();
</script>
</body></html>`,
    {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": [
          "default-src 'none'",
          `script-src 'nonce-${nonce}'`,
          `style-src 'nonce-${nonce}'`,
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; "),
      },
    },
  );
}

export async function POST(request: Request) {
  const action = actionFor(request);
  if (!action) return reply(404);
  const site = URL.parse(process.env.APP_URL ?? "");
  if (
    !site ||
    !["http:", "https:"].includes(site.protocol) ||
    site.origin !== request.headers.get("origin")
  )
    return reply(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return reply(415);
  let body: unknown;
  try {
    body = await limitedJSON(request, 256);
  } catch (error) {
    return reply(error instanceof ContentError ? error.status : 400);
  }
  if (!body || typeof body !== "object" || !("token" in body) || !isSubscriptionToken(body.token))
    return reply(400);
  try {
    const payload = await getPayload({ config });
    const consume = action === "confirm" ? confirmSubscription : unsubscribeSubscription;
    return reply((await consume(payload, body.token)) ? 200 : 400);
  } catch {
    return reply(503);
  }
}
