import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

test("route CLI accepts a neutral sitemap entry but never follows published redirects", async () => {
  let externalHits = 0;
  const outside = createServer((_req, res) => {
    externalHits++;
    res.end("external destination must not be fetched");
  });
  const outsideOrigin = await listen(outside);
  let origin = "",
    redirectPublished = false,
    pageRedirect = "canonical",
    inactiveHits = 0;
  const site = createServer((req, res) => {
    const path = new URL(req.url!, origin).pathname;
    if (path === "/") {
      res.writeHead(307, { Location: "/en" }).end();
    } else if (path === "/es/") {
      res.writeHead(308, { Location: "/es" }).end();
    } else if (path === "/en/guides") {
      const destination =
        pageRedirect === "canonical"
          ? "/en/guides/"
          : pageRedirect === "inactive"
            ? "/fr/redirect-target"
            : outsideOrigin + "/en/article";
      res.writeHead(308, { Location: destination }).end();
    } else if (path === "/sitemap.xml") {
      res.end(
        `<urlset><url><loc>${origin}${redirectPublished ? "/en/published" : "/llms.txt"}</loc></url></urlset>`,
      );
    } else if (path === "/en/published") {
      res.writeHead(302, { Location: outsideOrigin + "/en/article" }).end();
    } else if (path === "/llms.txt") {
      res.end("Public content guide");
    } else {
      if (path === "/fr/redirect-target") inactiveHits++;
      const locale = path.split("/")[1];
      const missing =
        !["en", "zh"].includes(locale) ||
        ["/en/not-real", "/zh/services/fake", "/en/request/extra"].includes(path);
      res.writeHead(missing ? 404 : 200);
      res.end(
        `<html lang="${locale === "zh" ? "zh-CN" : locale}" dir="ltr"><body>noindex</body></html>`,
      );
    }
  });
  origin = await listen(site);
  const run = () =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/check-routes.mjs"], {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          APP_URL: origin,
          SITE_LOCALES: "en,zh",
          DOTENV_CONFIG_PATH: "/dev/null",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        output += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  try {
    const good = await run();
    assert.equal(good.code, 0, good.output);
    redirectPublished = true;
    const unsafe = await run();
    assert.notEqual(unsafe.code, 0, "redirected published URL must fail the checker");
    assert.equal(externalHits, 0, "checker must not contact the redirect destination");
    redirectPublished = false;
    pageRedirect = "outside";
    assert.notEqual((await run()).code, 0);
    assert.equal(externalHits, 0, "ordinary pages must validate each redirect before fetching");
    pageRedirect = "inactive";
    assert.notEqual((await run()).code, 0);
    assert.equal(inactiveHits, 0, "inactive redirect destination must not be contacted");
  } finally {
    site.closeAllConnections();
    outside.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => site.close(() => r())),
      new Promise<void>((r) => outside.close(() => r())),
    ]);
  }
});
