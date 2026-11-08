import assert from "node:assert/strict";
import test from "node:test";
import {
  indexingAllowed,
  privateSearchPath,
  robotsContents,
  sitemapXML,
  contentMetadata,
} from "../src/lib/seo.ts";
import { validateContent, publicBody, type ContentBody } from "../src/lib/content-model.ts";
import { SEOSettings } from "../src/cms/seo.ts";
import type { PayloadRequest } from "payload";

const body: ContentBody = {
  contentKey: "arrival-guide",
  kind: "guide",
  locale: "en",
  slug: "arrival",
  title: "Arrival",
  blocks: [],
  sources: [],
};

test("search indexing requires an explicit production opt-in", () => {
  assert.equal(indexingAllowed({}), false);
  assert.equal(indexingAllowed({ APP_ENV: "trial", SEARCH_ENGINE_INDEXING: "true" }), false);
  assert.equal(indexingAllowed({ APP_ENV: "production" }), false);
  assert.equal(indexingAllowed({ APP_ENV: "production", SEARCH_ENGINE_INDEXING: "true" }), true);
  assert.match(robotsContents("https://example.com", false), /Disallow: \/\n/);
  assert.match(
    robotsContents("https://example.com", true),
    /Sitemap: https:\/\/example.com\/sitemap.xml/,
  );
  for (const path of [
    "/admin",
    "/api/inquiries",
    "/operations-overview",
    "/en/account",
    "/zh/support",
  ]) {
    assert.equal(privateSearchPath(path), true, path);
  }
  assert.equal(privateSearchPath("/en/guides/arrival"), false);
});

test("sitemap alternates use actual translated identities and enabled locales", () => {
  const docs: ContentBody[] = [
    body,
    { ...body, locale: "zh", slug: "dao-da" },
    { ...body, locale: "fr", slug: "arrivee" },
    { ...body, contentKey: "english-only", slug: "english-only" },
  ];
  const xml = sitemapXML("https://example.com", docs, ["zh", "en"]);
  assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
  assert.match(xml, /hreflang="zh-CN" href="https:\/\/example.com\/zh\/guides\/dao-da"/);
  assert.match(xml, /hreflang="en" href="https:\/\/example.com\/en\/guides\/arrival"/);
  assert.ok(!xml.includes("/fr/"));
  const single = xml.match(
    /<url><loc>https:\/\/example.com\/en\/guides\/english-only<\/loc>(.*?)<\/url>/s,
  )?.[1];
  assert.ok(single);
  assert.ok(!single.includes('hreflang="zh-CN"'));
  assert.ok(!xml.includes("/en/account"));
});

test("SEO content is validated and published without draft-only fields", () => {
  for (const seoImage of [-1, 0, "1", 1.5]) {
    assert.throws(() => validateContent({ ...body, seoImage }));
  }
  const seo = { ...body, seoTitle: "Custom title", seoDescription: "Custom summary", seoImage: 12 };
  validateContent(seo);
  assert.equal(publicBody(seo).seoImage, 12);
  const metadata = contentMetadata("https://example.com", "/en/guides/arrival", seo);
  assert.equal(metadata.title, "Custom title | Hua Companion · 华伴");
  assert.equal(metadata.description, "Custom summary");
  assert.deepEqual(metadata.openGraph.images, ["https://example.com/api/content-media/12"]);
  assert.equal(metadata.alternates.canonical, "https://example.com/en/guides/arrival");
});

test("static page SEO settings keep admin-only read and write access", async () => {
  const access = SEOSettings.access;
  assert.equal(typeof access?.read, "function");
  assert.equal(typeof access?.update, "function");
  if (typeof access?.read !== "function" || typeof access.update !== "function") return;
  for (const role of ["operations", "manager", "editor", "reviewer", "admin"]) {
    const req = { user: { id: 1, active: true, collection: "staff", role } } as PayloadRequest;
    assert.equal(await access.read({ req }), role === "admin");
    assert.equal(await access.update({ req }), role === "admin");
  }
  const req = { user: null } as PayloadRequest;
  assert.equal(await access.read({ req }), false);
  assert.equal(await access.update({ req }), false);
});

test("agent index is discoverable outside human page navigation without enabling indexing", () => {
  for (const index of [false, true]) {
    const robots = robotsContents("https://example.com", index);
    assert.match(robots, /https:\/\/example.com\/llms\.txt/);
    if (!index) assert.match(robots, /User-agent: \*\nDisallow: \/\n/);
  }
  const xml = sitemapXML("https://example.com", [], ["en", "zh"]);
  assert.equal((xml.match(/<loc>https:\/\/example.com\/llms\.txt<\/loc>/g) || []).length, 1);
});
