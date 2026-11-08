import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { locales } from "../../src/lib/locales";
import { parseSiteLocales } from "../../src/lib/site-locales";
if (process.env.APP_ENV !== "local") throw Error("Local fixture database required");
const p = await getPayload({ config });
const settings = await p.findGlobal({ slug: "support-settings" });
const base = process.env.AUTHZ_HTTP_URL || "http://127.0.0.1:3000";
if (!base.startsWith("http://127.0.0.1:")) throw Error("Local HTTP only");
let cookie = "";
async function post(body: any, customCookie = cookie, origin = base) {
  return fetch(base + "/api/support", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", Cookie: customCookie },
    body: JSON.stringify(body),
  });
}
async function assertClosedPage() {
  for (const locale of parseSiteLocales(process.env.SITE_LOCALES)) {
    const response = await fetch(`${base}/${locale}/support`, {
      redirect: "manual",
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 307, `${locale}: closed support redirects before rendering`);
    assert.equal(response.headers.get("location"), `/${locale}/contact`);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.doesNotMatch(html, /class="section support-page"|hua-support-active|support-messages/);
    const contact = await fetch(`${base}/${locale}/support`);
    assert.equal(contact.status, 200);
    assert.equal(new URL(contact.url).pathname, `/${locale}/contact`);
  }
  for (const locale of locales.filter(
    (l) => !parseSiteLocales(process.env.SITE_LOCALES).includes(l),
  ))
    assert.equal((await fetch(`${base}/${locale}/support`, { redirect: "manual" })).status, 404);
  assert.equal((await fetch(`${base}/invalid/support`, { redirect: "manual" })).status, 404);
}
try {
  await p.updateGlobal({ slug: "support-settings", data: { textChat: false } });
  await assertClosedPage();
  assert.equal((await post({ action: "start", key: randomUUID(), locale: "en" })).status, 503);
  await p.updateGlobal({ slug: "support-settings", data: { textChat: true } });
  const start = await post({
    action: "start",
    key: randomUUID(),
    locale: "en",
    topic: "business",
    aiConsent: false,
  });
  assert.equal(start.status, 200);
  const set = start.headers.get("set-cookie")!;
  assert.ok(set.includes("HttpOnly"));
  cookie = set.split(";")[0];
  const c = await start.json();
  assert.equal(
    (
      await post({
        action: "message",
        id: c.id,
        key: randomUUID(),
        text: "Fictional exhibition inquiry",
      })
    ).status,
    200,
  );
  const own = await fetch(base + "/api/support?id=" + c.id, { headers: { Cookie: cookie } });
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.ok(body.messages.some((m: any) => m.text === "Fictional exhibition inquiry"));
  assert.equal("visitorHash" in body.conversation, false);
  const stranger = await fetch(base + "/api/support?id=" + c.id, {
    headers: { Cookie: "hua-support=" + "a".repeat(64) },
  });
  assert.ok(stranger.status >= 400);
  assert.equal(
    (await post({ action: "handoff", id: c.id }, cookie, "https://not-hua.invalid")).status,
    403,
  );
  assert.equal((await fetch(base + "/api/support/staff")).status, 403);
  const activeLocales = parseSiteLocales(process.env.SITE_LOCALES);
  for (const locale of locales) {
    const response = await fetch(`${base}/${locale}/support`);
    assert.equal(response.status, activeLocales.includes(locale) ? 200 : 404);
    if (!activeLocales.includes(locale)) continue;
    const page = await response.text();
    assert.match(page, /class="section support-page"/);
    if (locale === "en") {
      assert.match(page, /this browser/i);
      assert.match(page, /another device/i);
      assert.doesNotMatch(page, /This browser credential grants conversation access/);
    }
    if (locale === "zh") assert.match(page, /这个浏览器/);
    assert.match(page, new RegExp(`<html[^>]*lang="${locale === "zh" ? "zh-CN" : locale}"`));
    assert.match(page, new RegExp(`<html[^>]*dir="${locale === "ar" ? "rtl" : "ltr"}"`));
  }
  for (const route of [
    "/api/support/calls/staff",
    "/api/support/operations",
    "/api/support/voice?audio=1",
    "/api/support/voice/jobs?job=1",
  ])
    assert.ok((await fetch(base + route)).status >= 400, route + " must require authorized scope");
  const features = (
    await (await fetch(base + "/api/support", { headers: { Cookie: cookie } })).json()
  ).features;
  assert.equal(features.voiceMessages.implemented, true);
  assert.equal(features.humanCalls.implemented, true);
  if (!features.humanCalls.available) {
    const off = await fetch(base + "/api/support/calls", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        action: "start",
        conversation: c.id,
        kind: "human",
        key: randomUUID(),
      }),
    });
    assert.equal(off.status, 503);
  }
  await p.updateGlobal({ slug: "support-settings", data: { textChat: false } });
  await assertClosedPage();
  console.log(
    "PASS support page off/on/off, localized redirect and plain copy; multimodal HTTP gates; support HTTP cookies, visitor isolation, origin protection, staff auth and active public languages",
  );
} finally {
  await p.updateGlobal({
    slug: "support-settings",
    data: { textChat: settings.textChat === true },
  });
  await p.destroy();
}
process.exit(0);
