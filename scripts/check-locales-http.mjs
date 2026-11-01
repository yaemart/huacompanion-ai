import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3000";
const locales = ["zh", "en", "es", "fr", "de", "it", "ar"];
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
    for (const option of locales)
      assert.ok(html.includes(`value="${option}"`), `Language option ${option}: ${locale}${path}`);
    checked++;
  }
  for (const api of ["content", "catalog"]) {
    const response = await fetch(`${origin}/api/public/${api}?locale=${locale}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.locale, locale);
    assert.ok(body.items.every((item) => item.locale === locale));
  }
}
assert.equal((await fetch(origin + "/ja")).status, 404);
assert.equal((await fetch(origin + "/api/public/content?locale=ja")).status, 400);
assert.equal((await fetch(origin + "/api/public/catalog?locale=ja")).status, 400);
console.log(
  `PASS ${checked} localized pages, 14 public API checks, and unsupported language rejection`,
);
