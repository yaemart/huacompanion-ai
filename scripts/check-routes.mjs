const pages = [
  "",
  "services",
  "guides",
  "partners",
  "about",
  "contact",
  "request",
  "apply",
  "privacy",
  "terms",
  "providers", "services/projects", "exhibitions", "institutions", "life", "support", "account",
];
let count = 0;
for (const locale of ["en", "zh", "es", "fr", "de", "it", "ar"])
  for (const page of pages) {
    const url = `http://127.0.0.1:3000/${locale}/${page}`;
    const res = await fetch(url);
    const html = await res.text();
    if (
      res.status !== 200 ||
      !html.includes(`<html lang="${locale === "zh" ? "zh-CN" : locale}"`) ||
      !html.includes("<body>") ||
      !html.includes("noindex")
    )
      throw Error(`Invalid document: ${url} ${res.status}`);
    count++;
  }
// Published URLs come from the actual public sitemap; unpublished seed slugs are not pages.
const sitemapResponse = await fetch("http://127.0.0.1:3000/sitemap.xml");
if (!sitemapResponse.ok) throw Error("Sitemap unavailable");
const sitemap = await sitemapResponse.text();
for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(match[1].replaceAll("&amp;", "&"));
  if (url.origin !== "http://127.0.0.1:3000") throw Error("Unexpected sitemap origin");
  const res = await fetch(url);
  if (res.status !== 200) throw Error(`Published URL unavailable: ${url.pathname} ${res.status}`);
  count++;
}
for (const path of [
  "/en/not-real",
  "/zh/services/fake",
  "/xx",
  "/en/request/extra",
]) {
  const res = await fetch("http://127.0.0.1:3000" + path);
  const html = await res.text();
  if (res.status !== 404 || !html.includes("<html") || !html.includes("<body>"))
    throw Error(`Invalid 404: ${path} ${res.status}`);
  count++;
}
const root = await fetch("http://127.0.0.1:3000/", { redirect: "manual" });
if (root.status !== 307 || root.headers.get("location") !== "/en")
  throw Error("Root redirect failed");
console.log(`${count} page/404 checks passed; root redirects to /en.`);
