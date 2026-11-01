import "dotenv/config";
import assert from "node:assert/strict";
import { parseSiteLocales } from "../src/lib/site-locales.ts";
const origin = "http://127.0.0.1:3000";
const supported = ["zh", "en", "es", "fr", "de", "it", "ar"];
const locales = parseSiteLocales(process.env.SITE_LOCALES);
let checked = 0;
for (const locale of locales) {
  for (const path of ["", "/request", "/apply", "/providers", "/services/projects", "/guides"]) {
    const response = await fetch(origin + "/" + locale + path);
    assert.equal(response.status, 200, `${locale}${path}`);
    const html = await response.text();
    assert.ok(
      html.includes(`lang="${locale === "zh" ? "zh-CN" : locale}"`),
      `HTML language: ${locale}${path}`,
    );
    assert.ok(
      html.includes(`dir="${locale === "ar" ? "rtl" : "ltr"}"`),
      `HTML direction: ${locale}${path}`,
    );
    const switcher = html.match(/<select[^>]*class="language"[^>]*>[\s\S]*?<\/select>/)?.[0];
    assert.ok(switcher, `Language switcher: ${locale}${path}`);
    for (const option of supported)
      assert.equal(
        switcher.includes(`value="${option}"`),
        locales.includes(option),
        `Language option ${option}: ${locale}${path}`,
      );
    checked++;
  }
  for (const api of ["content", "catalog", "exhibitions", "institutions", "life"]) {
    const response = await fetch(`${origin}/api/public/${api}?locale=${locale}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.locale, locale);
    assert.ok(body.items.every((item) => item.locale === locale));
  }
}
for (const locale of supported.filter((locale) => !locales.includes(locale))) {
  for (const path of ["", "/request", "/apply", "/support", "/account"])
    assert.equal((await fetch(origin + "/" + locale + path)).status, 404);
  for (const api of ["content", "catalog", "exhibitions", "institutions", "life"])
    assert.equal((await fetch(`${origin}/api/public/${api}?locale=${locale}`)).status, 400);
}
const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
for (const locale of supported) {
  assert.equal(sitemap.includes(`/${locale}</loc>`), locales.includes(locale));
  assert.equal(
    sitemap.includes(`hreflang="${locale === "zh" ? "zh-CN" : locale}"`),
    locales.includes(locale),
  );
}
assert.equal((await fetch(origin + "/ja")).status, 404);
assert.equal((await fetch(origin + "/api/public/content?locale=ja")).status, 400);
assert.equal((await fetch(origin + "/api/public/catalog?locale=ja")).status, 400);
console.log(
  `PASS ${checked} localized pages, ${locales.length * 5} active public API checks, and unsupported language rejection`,
);
