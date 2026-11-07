import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import type { ContentBody } from "../../src/lib/content-model";

if (process.env.APP_ENV !== "local") throw Error("Dedicated local tests only");
const database = new URL(process.env.DATABASE_URL!);
if (database.hostname !== "127.0.0.1" || database.port !== "55438")
  throw Error("Dedicated local DB required");
const base = "http://127.0.0.1:3000";
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { role: { equals: "admin" } },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
assert.ok(admin);
const oldSettings = await p.findGlobal({ slug: "seo-settings", depth: 0 });
const key = `seo-${randomUUID()}`;
const staffIDs: number[] = [],
  mediaIDs: number[] = [],
  filenames: string[] = [];
let draftID: number | undefined;
let passed = 0;
const check = (message: string) => {
  passed++;
  console.log("PASS " + message);
};

try {
  const editors = [];
  for (const kind of ["guide", "guide", "service"]) {
    const user = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: {
        name: "SEO fictional editor",
        email: `${randomUUID()}@example.invalid`,
        password: randomBytes(24).toString("hex"),
        active: true,
        role: "editor",
        additionalRoles: [],
        contentKinds: [kind as "guide" | "service"],
      },
    });
    staffIDs.push(user.id);
    editors.push(user);
  }
  const [editor, colleague, otherBoard] = editors;
  for (const user of [editor, otherBoard]) {
    await assert.rejects(() => p.findGlobal({ slug: "seo-settings", user, overrideAccess: false }));
    await assert.rejects(() =>
      p.updateGlobal({ slug: "seo-settings", user, overrideAccess: false, data: { pages: [] } }),
    );
  }
  await assert.rejects(() => p.findGlobal({ slug: "seo-settings", overrideAccess: false }));
  assert.equal((await fetch(base + "/api/globals/seo-settings")).status, 403);
  check("static SEO settings deny anonymous and non-admin access");

  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
    .webp()
    .toBuffer();
  await mkdir(path.resolve(".local/content-media"), { recursive: true });
  for (const owner of [admin, editor, admin]) {
    const filename = randomUUID() + ".webp";
    filenames.push(filename);
    await writeFile(path.resolve(".local/content-media", filename), image, { mode: 0o600 });
    const media = await p.create({
      collection: "content-media",
      data: {
        filename,
        alt: "Fictional SEO pixel",
        rights: "Owned integration fixture",
        size: image.length,
        uploadedBy: owner.id,
      },
    });
    mediaIDs.push(media.id);
    assert.equal((await fetch(base + `/api/content-media/${media.id}`)).status, 404);
  }
  const [staticImage, articleImage, draftImage] = mediaIDs;
  const body: ContentBody = {
    contentKey: key,
    kind: "guide",
    locale: "en",
    slug: key,
    title: "Fictional SEO article",
    blocks: [{ type: "paragraph", text: "Fictional SEO fixture body." }],
    sources: [
      { id: "fixture", title: "Fictional test source", url: "https://example.invalid/seo" },
    ],
    seoTitle: "Published SEO " + key,
    seoDescription: "Published SEO description",
    seoImage: articleImage,
  };
  await assert.rejects(() =>
    mutateContent(p, editor, { action: "save", body: { ...body, seoImage: staticImage } }),
  );
  let draft = await mutateContent(p, editor, { action: "save", body });
  draftID = draft.id;
  await p.findByID({
    collection: "content-media",
    id: articleImage,
    user: colleague,
    overrideAccess: false,
  });
  await assert.rejects(() =>
    p.findByID({
      collection: "content-media",
      id: articleImage,
      user: otherBoard,
      overrideAccess: false,
    }),
  );
  assert.equal((await fetch(base + `/api/content-media/${articleImage}`)).status, 404);
  check("SEO image choices follow existing draft board permissions and remain private");

  const submitted = await mutateContent(p, editor, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  draft = await mutateContent(p, admin, {
    action: "publish",
    id: draft.id,
    revision: submitted.revision,
    overrideReason: "Local SEO integration reviewed fixture",
  });
  const page = await fetch(base + "/en/guides/" + key);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("Published SEO " + key));
  assert.ok(html.includes(`${base}/api/content-media/${articleImage}`));
  assert.equal((await fetch(base + `/api/content-media/${articleImage}`)).status, 200);
  check("published title description and sharing image are actually rendered");

  draft = await mutateContent(p, admin, {
    action: "save",
    id: draft.id,
    revision: draft.revision,
    body: { ...body, seoTitle: "Unpublished SEO " + key, seoImage: draftImage },
  });
  const unchanged = await (await fetch(base + "/en/guides/" + key)).text();
  assert.ok(unchanged.includes("Published SEO " + key));
  assert.ok(!unchanged.includes("Unpublished SEO " + key));
  assert.equal((await fetch(base + `/api/content-media/${draftImage}`)).status, 404);
  check("editing draft SEO cannot change published metadata or expose its image");

  const priorPages = oldSettings.pages || [];
  await p.updateGlobal({
    slug: "seo-settings",
    user: admin,
    overrideAccess: false,
    data: {
      pages: [
        ...priorPages.filter((page) => !(page.path === "request" && page.locale === "en")),
        {
          path: "request",
          locale: "en",
          seoTitle: "Consultation SEO " + key,
          seoDescription: "Fictional form SEO",
          seoImage: staticImage,
        },
      ],
    },
  });
  const formResponse = await fetch(base + "/en/request");
  const formHTML = await formResponse.text();
  assert.ok(formHTML.includes("Consultation SEO " + key));
  assert.ok(formHTML.includes(`${base}/api/content-media/${staticImage}`));
  assert.equal((await fetch(base + `/api/content-media/${staticImage}`)).status, 200);
  assert.equal(formResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  const robots = await (await fetch(base + "/robots.txt")).text();
  assert.match(robots, /Disallow: \/\n/);
  const sitemap = await (await fetch(base + "/sitemap.xml")).text();
  assert.ok(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
  assert.ok(sitemap.includes('hreflang="zh-CN"'));
  assert.ok(sitemap.includes(`/en/guides/${key}`));
  assert.ok(!sitemap.includes(`/zh/guides/${key}`));
  check("static page admin SEO is editable, trial noindex and multilingual sitemap are live");

  await p.updateGlobal({
    slug: "seo-settings",
    user: admin,
    data: { pages: oldSettings.pages || [] },
  });
  assert.equal((await fetch(base + `/api/content-media/${staticImage}`)).status, 404);
  await mutateContent(p, admin, {
    action: "unpublish",
    id: draft.id,
    revision: draft.revision,
    overrideReason: "Local SEO fixture withdrawal after administrative edit",
  });
  assert.equal((await fetch(base + `/api/content-media/${articleImage}`)).status, 404);
  check("removing static selection and unpublishing revoke public image access");
  console.log(`PASS ${passed} SEO database and HTTP checks`);
} finally {
  await p.updateGlobal({
    slug: "seo-settings",
    user: admin,
    data: { pages: oldSettings.pages || [] },
  });
  if (draftID) {
    await p.delete({ collection: "content-published", where: { draftId: { equals: draftID } } });
    await p.delete({ collection: "content-drafts", id: draftID });
  }
  for (const id of mediaIDs) await p.delete({ collection: "content-media", id });
  for (const filename of filenames) await unlink(path.resolve(".local/content-media", filename));
  for (const id of staffIDs)
    await p.update({ collection: "staff", id, user: admin, data: { active: false } });
  await p.destroy();
}
process.exit(0);
