import assert from "node:assert/strict";
import { test } from "node:test";
import { routeCheckOrigin, sitemapCheckURL } from "../scripts/lib/route-checks.mjs";

test("route checks accept only a local HTTP origin before making requests", () => {
  assert.equal(routeCheckOrigin("http://127.0.0.1:3201"), "http://127.0.0.1:3201");
  assert.equal(routeCheckOrigin("http://127.0.0.1:3000/"), "http://127.0.0.1:3000");
  for (const raw of [
    "https://example.invalid",
    "https://127.0.0.1:3201",
    "http://127.0.0.1",
    "http://user:secret@127.0.0.1:3201",
    "http://127.0.0.1:3201/en",
    "http://127.0.0.1:3201?test=1",
    "http://127.0.0.1:3201#section",
  ])
    assert.throws(() => routeCheckOrigin(raw));
});

test("sitemap checks permit the exact neutral content guide and active-language pages", () => {
  const origin = "http://127.0.0.1:3201";
  assert.equal(sitemapCheckURL(origin + "/llms.txt", origin, ["en", "zh"]).pathname, "/llms.txt");
  assert.equal(sitemapCheckURL(origin + "/zh/about", origin, ["en", "zh"]).pathname, "/zh/about");
  for (const path of ["/llms.txt/extra", "/robots.txt", "/fr/about", "/%65n/about"]) {
    assert.throws(() => sitemapCheckURL(origin + path, origin, ["en", "zh"]));
  }
  for (const url of [
    "http://example.invalid/en/about",
    "http://127.0.0.1:3000/en/about",
    "http://user:secret@127.0.0.1:3201/en/about",
    origin + "/en/about?preview=1",
    origin + "/llms.txt#section",
  ])
    assert.throws(() => sitemapCheckURL(url, origin, ["en", "zh"]));
});
