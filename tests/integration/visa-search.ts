import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { visaToolPath } from "../../src/lib/visa-search";
import { pageSEO, isStaticSEOImage, googleVerification } from "../../src/server/seo";
if (process.env.APP_ENV !== "local") throw Error("Local fixtures only");
const db = new URL(process.env.DATABASE_URL || "");
if (db.hostname !== "127.0.0.1" || db.port !== "55438" || db.pathname !== "/hua_companion")
  throw Error("Dedicated local DB only");
const base = "http://127.0.0.1:3000";
const enabled = process.argv.includes("--enabled");
const p = await getPayload({ config });
const old = await p.findGlobal({ slug: "seo-settings", depth: 0 });
const flag = process.env.VISA_CHECKER_ENABLED;
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
const filename = randomUUID() + ".webp";
let staff: number | undefined, media: number | undefined;
try {
  const user = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: "Search fixture",
      email: `${randomUUID()}@example.invalid`,
      password: randomUUID(),
      role: "editor",
      active: true,
      contentKinds: ["guide"],
    },
  });
  staff = user.id;
  for (const actor of [user, null]) {
    await assert.rejects(() =>
      p.findGlobal({ slug: "seo-settings", user: actor, overrideAccess: false }),
    );
    await assert.rejects(() =>
      p.updateGlobal({
        slug: "seo-settings",
        user: actor,
        overrideAccess: false,
        data: { googleSiteVerification: "forbidden" },
      }),
    );
  }
  for (const token of [
    "<meta content=x>",
    "<script>alert(1)</script>",
    "https://bad.invalid",
    "x".repeat(257),
  ])
    await assert.rejects(() =>
      p.updateGlobal({
        slug: "seo-settings",
        user: admin,
        overrideAccess: false,
        data: { googleSiteVerification: token },
      }),
    );
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "seo-settings",
      user: admin,
      overrideAccess: false,
      data: { pages: [{ path: visaToolPath, locale: "fr" }] },
    }),
  );
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
    .webp()
    .toBuffer();
  await mkdir(".local/content-media", { recursive: true });
  await writeFile(`.local/content-media/${filename}`, image, { mode: 0o600 });
  media = (
    await p.create({
      collection: "content-media",
      data: {
        filename,
        alt: "Fictional search image",
        rights: "Owned test",
        size: image.length,
        uploadedBy: admin.id,
      },
    })
  ).id;
  await p.updateGlobal({
    slug: "seo-settings",
    user: admin,
    overrideAccess: false,
    data: {
      googleSiteVerification: "Hua_Search_Fixture-123",
      pages: [
        {
          path: visaToolPath,
          locale: "en",
          seoTitle: "Search Fixture Title",
          seoDescription: "Search Fixture Summary",
          seoImage: media,
        },
      ],
    },
  });
  assert.equal(await googleVerification(p), "Hua_Search_Fixture-123");
  process.env.VISA_CHECKER_ENABLED = "false";
  assert.equal(await pageSEO(p, "en", visaToolPath), undefined);
  assert.equal(await isStaticSEOImage(p, media), false);
  process.env.VISA_CHECKER_ENABLED = "true";
  assert.equal((await pageSEO(p, "en", visaToolPath))?.seoTitle, "Search Fixture Title");
  assert.equal(await pageSEO(p, "fr", visaToolPath), undefined);
  assert.equal(await isStaticSEOImage(p, media), true);
  const homeResponse = await fetch(base + "/en");
  const home = await homeResponse.text();
  assert.match(home, /name="google-site-verification" content="Hua_Search_Fixture-123"/);
  assert.equal(home.includes(`href="/en/${visaToolPath}"`), enabled);
  const sitemap = await (await fetch(base + "/sitemap.xml")).text();
  const llms = await (await fetch(base + "/llms.txt")).text();
  for (const locale of ["en", "zh"]) {
    const r = await fetch(`${base}/${locale}/${visaToolPath}`);
    assert.equal(r.status, enabled ? 200 : 404);
    assert.match(r.headers.get("x-robots-tag") || "", /noindex/);
    assert.equal(sitemap.includes(`/${locale}/${visaToolPath}`), enabled);
    assert.equal(llms.includes(`/${locale}/${visaToolPath}`), enabled);
    if (enabled) {
      const html = await r.text();
      assert.match(html, /name="robots" content="noindex, nofollow"/);
      for (const lang of ["en", "zh-CN", "x-default"])
        assert.ok(html.includes(`hrefLang="${lang}"`) || html.includes(`hreflang="${lang}"`));
      if (locale === "en") {
        assert.match(html, /Search Fixture Title/);
        assert.match(html, /Search Fixture Summary/);
        assert.ok(html.includes(`/api/content-media/${media}`));
      } else assert.ok(html.includes("/visa-checker-share.png"));
    }
  }
  for (const locale of ["es", "fr", "de", "it", "ar"]) {
    assert.equal((await fetch(`${base}/${locale}/${visaToolPath}`)).status, 404);
    assert.ok(!sitemap.includes(`/${locale}/${visaToolPath}`));
    assert.ok(!llms.includes(`/${locale}/${visaToolPath}`));
  }
  assert.ok(!sitemap.includes("/undefined/"));
  assert.equal((await fetch(`${base}/api/content-media/${media}`)).status, enabled ? 200 : 404);
  assert.equal((await fetch(base + "/api/globals/seo-settings")).status, 403);
  for (const path of ["/workflow-center", "/content-center", "/en/account", "/admin/login"])
    assert.match(
      (await fetch(base + path, { redirect: "manual" })).headers.get("x-robots-tag") || "",
      /noindex/,
    );
  console.log(
    `PASS search ${enabled ? "enabled" : "disabled"}: metadata, navigation, sitemap, llms, languages, private noindex, admin ACL, media and token validation`,
  );
} finally {
  await p.updateGlobal({
    slug: "seo-settings",
    data: { pages: old.pages, googleSiteVerification: old.googleSiteVerification || null },
  });
  if (media) await p.delete({ collection: "content-media", id: media });
  await unlink(`.local/content-media/${filename}`).catch(() => {});
  if (staff) await p.delete({ collection: "staff", id: staff, user: admin });
  if (flag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = flag;
  await p.destroy();
}
process.exit(0);
