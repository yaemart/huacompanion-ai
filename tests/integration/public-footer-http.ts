import assert from "node:assert/strict";
const base = process.env.APP_URL || "http://127.0.0.1:3100";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("Local HTTP only");
const pages = [
  "",
  "/guides",
  "/services",
  "/providers",
  "/services/projects",
  "/exhibitions",
  "/institutions",
  "/life",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/request",
  "/apply",
  "/support",
  "/account",
];
if (process.argv.includes("--enabled")) pages.push("/tools/china-visa-free-checker");
const checkedLinks = new Set<string>();
for (const locale of ["en", "zh"]) {
  for (const path of pages) {
    const response = await fetch(base + "/" + locale + path);
    assert.equal(response.status, 200, `${locale}${path}`);
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/g) || [];
    assert.equal(footers.length, 1, `${locale}${path}: exactly one complete footer`);
    const footer = footers[0];
    assert.match(footer, /class="footer-main"/, `${locale}${path}: complete footer`);
    for (const target of ["request", "privacy", "terms"])
      assert.match(footer, new RegExp(`href="/${locale}/${target}"`));
    assert.match(footer, /HUA COMPANION/);
    assert.doesNotMatch(
      footer,
      /\/api\/public|llms\.txt|data for agents|Starting in Shanghai|从中国上海出发|pending verification|公司主体与联系方式待核实/,
    );
    for (const href of footer.matchAll(/href="(\/[^"]+)"/g)) checkedLinks.add(href[1]);
  }
}
for (const href of checkedLinks) assert.equal((await fetch(base + href)).status, 200, href);
for (const path of ["/robots.txt", "/sitemap.xml"]) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /llms\.txt/);
}
assert.equal((await fetch(base + "/llms.txt")).status, 200);
console.log(
  `PASS ${pages.length * 2} public pages share one localized complete footer; links resolve; agent discovery preserved`,
);
