import test from "node:test";
import assert from "node:assert/strict";
import {
  toolLocales,
  toolAlternates,
  verificationToken,
  visaToolPath,
} from "../src/lib/visa-search.ts";
import { sitemapXML } from "../src/lib/seo.ts";
import { locales } from "../src/lib/locales.ts";

test("tool discovery is off by default and only actual enabled English/Chinese routes appear", () => {
  assert.deepEqual(toolLocales(locales, false), []);
  assert.deepEqual(toolLocales(locales, true), ["zh", "en"]);
  assert.deepEqual(toolLocales(["fr", "en"], true), ["en"]);
  assert.deepEqual(toolAlternates("https://example.invalid", ["zh"], true), {
    "zh-CN": `https://example.invalid/zh/${visaToolPath}`,
    "x-default": `https://example.invalid/zh/${visaToolPath}`,
  });
  assert.deepEqual(toolAlternates("https://example.invalid", locales, false), {});
  const off = sitemapXML("https://example.invalid", [], locales, false);
  assert.ok(!off.includes(visaToolPath));
  const on = sitemapXML("https://example.invalid", [], locales, true);
  assert.ok(on.includes(`/en/${visaToolPath}`));
  assert.ok(on.includes(`/zh/${visaToolPath}`));
  for (const locale of ["es", "fr", "de", "it", "ar"])
    assert.ok(!on.includes(`/${locale}/${visaToolPath}`));
});
test("Google verification is a bounded token, never markup or a URL", () => {
  assert.equal(verificationToken("AbC_123-def"), "AbC_123-def");
  for (const value of [undefined, null, ""]) assert.equal(verificationToken(value), undefined);
  for (const value of [
    "<meta content=x>",
    "<script>x</script>",
    "https://example.com",
    "a b",
    "x".repeat(257),
    42,
  ])
    assert.throws(() => verificationToken(value));
});

test("raw policy snapshots never invent public detail URLs in sitemap", () => {
  const xml = sitemapXML(
    "https://example.invalid",
    [
      {
        kind: "immigration-policy",
        locale: "en",
        slug: "private-policy",
        contentKey: "private-policy",
      },
    ] as never,
    ["en", "zh"],
    true,
  );
  assert.ok(!xml.includes("private-policy"));
  assert.ok(!xml.includes("undefined"));
});
