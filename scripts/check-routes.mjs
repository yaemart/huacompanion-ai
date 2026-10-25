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
  ...[
    "medical",
    "business",
    "transport",
    "stays",
    "travel",
    "interpretation",
    "arrival",
  ].map((s) => "services/" + s),
  ...[
    "before-you-arrive",
    "business-visit-brief",
    "medical-visit-process",
    "transfer-checklist",
    "choosing-your-stay",
    "everyday-confidence",
  ].map((s) => "guides/" + s),
];
let count = 0;
for (const locale of ["en", "zh"])
  for (const page of pages) {
    const url = `http://127.0.0.1:3000/${locale}/${page}`;
    const res = await fetch(url);
    const html = await res.text();
    if (
      res.status !== 200 ||
      !html.includes(`<html lang="${locale === "zh" ? "zh-CN" : "en"}"`) ||
      !html.includes("<body>") ||
      !html.includes("noindex")
    )
      throw Error(`Invalid document: ${url} ${res.status}`);
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
