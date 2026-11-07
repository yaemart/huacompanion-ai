import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";
const base = process.env.TRIAL_TEST_URL || "http://127.0.0.1:3002";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("Local HTTP verification only");
const maintenance = process.argv.includes("--maintenance");
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(base + "/api/health")).status === 200) break;
  } catch {
    /* starting */
  }
  if (attempt === 59) throw Error("Local trial server not ready");
  await setTimeout(500);
}
const password = process.env.TRIAL_ACCESS_PASSWORD;
if (!password) throw Error("Fixture password required through environment");
const auth = `Basic ${Buffer.from(`${process.env.TRIAL_ACCESS_USER}:${password}`).toString("base64")}`;
const paths = [
  "/",
  "/zh",
  "/en",
  "/admin/login",
  "/api/globals/seo-settings",
  "/sitemap.xml",
  "/llms.txt",
  "/robots.txt",
  "/visa-checker-share.png",
  "/_next/static/missing.js",
  "/_next/image?url=%2Fvisa-checker-share.png&w=640&q=75",
  "/api/health?next=/admin",
];
for (const path of paths.filter((p) => !p.startsWith("/api/health"))) {
  for (const headers of [
    {},
    { authorization: "Basic YmFkOmJhZA==" },
    { "x-middleware-subrequest": "src/proxy", "x-hua-trial-access": "true" },
  ]) {
    const response = await fetch(base + path, { headers, redirect: "manual" });
    assert.equal(response.status, maintenance ? 503 : 401, path);
    if (!maintenance) assert.match(response.headers.get("www-authenticate"), /Basic/);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
}
for (const path of ["/api/health", "/api/health?next=/admin"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
}
assert.equal(
  (await fetch(base + "/api/health", { method: "POST" })).status,
  maintenance ? 503 : 401,
);
for (const path of ["/zh", "/en", "/admin/login", "/visa-checker-share.png"]) {
  const response = await fetch(base + path, { headers: { authorization: auth } });
  assert.equal(response.status, maintenance ? 503 : 200, path);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
}
assert.equal(
  (await fetch(base + "/api/globals/seo-settings", { headers: { authorization: auth } })).status,
  maintenance ? 503 : 403,
);
assert.equal(
  (
    await fetch(base + "/api/staff/first-register", {
      method: "POST",
      headers: { authorization: auth },
    })
  ).status,
  maintenance ? 503 : 403,
);
assert.equal(
  (await fetch(base + "/zh/tools/china-visa-free-checker", { headers: { authorization: auth } }))
    .status,
  maintenance ? 503 : 404,
);
console.log(
  "PASS trial gate: pages, APIs, static files, anonymous image-optimizer rejection, spoofed headers, health isolation, employee ACL and noindex",
);
