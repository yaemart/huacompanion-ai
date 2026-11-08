import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import type { ContentBody } from "../../src/lib/content-model";
const base = process.env.APP_URL || "";
const db = new URL(process.env.DATABASE_URL || "");
const clone = db.port === "55442" && /^\/hua_client_d1_[a-f0-9]{32}$/.test(db.pathname);
const ci = process.env.CI === "true" && db.port === "55438" && db.pathname === "/hua_companion";
if (
  process.env.APP_ENV !== "local" ||
  db.hostname !== "127.0.0.1" ||
  (!clone && !ci) ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error("Disposable D1 clone or CI only");
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await fetch(base + "/en")).ok) break;
  } catch {
    /* Wait for the local production process. */
  }
  await setTimeout(500);
}
async function page(path: string) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  return (await response.text())
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "");
}
const enabled = process.argv.includes("--enabled");
for (const locale of ["en", "zh"]) {
  const html = await page(`/${locale}`);
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] || "";
  assert.equal(main.includes(`/tools/china-visa-free-checker`), enabled);
  const menu = html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(menu.includes(`/${locale}/`));
  assert.equal(menu.includes("/tools/china-visa-free-checker"), enabled);
  assert.doesNotMatch(main, /Service directories|服务目录/);
  assert.doesNotMatch(await page(`/${locale}/guides`), /<small>0\s*published<\/small>/);
}
if (!enabled) {
  console.log("PASS homepage/menu tool feature-off and no unrelated service subnavigation");
  process.exit(0);
}
const p = await getPayload({ config });
const admin = (
  await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
).docs[0];
assert.ok(admin?.active);
const key = `d1-${randomUUID()}`;
const service: ContentBody = {
  contentKey: key,
  kind: "service",
  locale: "en",
  slug: key,
  title: "Fictional D1 service",
  blocks: [{ type: "paragraph", text: "Fictional local regression only" }],
  sources: [],
};
const guide: ContentBody = {
  ...service,
  contentKey: key + "-guide",
  kind: "guide",
  slug: key + "-guide",
  title: "D1 guide",
  category: 7,
  blocks: [
    { type: "link", text: "D1 internal service", url: base + "/en/services/" + key },
    {
      type: "link",
      text: "D1 external source",
      url: "https://external.example/en/services/missing",
    },
  ],
  sources: [{ id: "s", title: "Fictional source", url: "https://example.invalid/source" }],
};
const ids: number[] = [];
async function publish(body: ContentBody) {
  let draft = await mutateContent(p, admin, { action: "save", body });
  ids.push(draft.id);
  draft = await mutateContent(p, admin, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  return mutateContent(p, admin, {
    action: "publish",
    id: draft.id,
    revision: draft.revision,
    overrideReason: "Fictional disposable D1 regression",
  });
}
try {
  let draft = await mutateContent(p, admin, { action: "save", body: service });
  ids.push(draft.id);
  await publish(guide);
  const target = base + "/en/services/" + key;
  const html = await page("/en/guides/" + guide.slug);
  assert.ok(html.includes("D1 internal service"));
  assert.ok(!html.includes(`href="${target}"`), "Draft service is text, not a broken link");
  assert.match(html, /href="https:\/\/external.example\/en\/services\/missing"/);
  draft = await mutateContent(p, admin, {
    action: "submit",
    id: draft.id,
    revision: draft.revision,
  });
  assert.ok(!(await page("/en/guides/" + guide.slug)).includes(`href="${target}"`));
  draft = await mutateContent(p, admin, {
    action: "publish",
    id: draft.id,
    revision: draft.revision,
    overrideReason: "Fictional disposable D1 regression",
  });
  assert.ok((await page("/en/guides/" + guide.slug)).includes(`href="${target}"`));
  assert.match(await page("/en/services/" + key), /Service directories/);
  await mutateContent(p, admin, {
    action: "unpublish",
    overrideReason: "Fictional disposable D1 cleanup",
    id: draft.id,
    revision: draft.revision,
  });
  assert.ok(
    !(await page("/en/guides/" + guide.slug)).includes(`href="${target}"`),
    "Fresh requests see unpublication immediately",
  );
  assert.equal((await fetch(target)).status, 404);
  assert.doesNotMatch(await page("/en/guides"), /Service directories/);
  console.log(
    "PASS public homepage, guide categories, service subnavigation and draft/submitted/published/unpublished link lifecycle",
  );
} finally {
  for (const id of ids.reverse()) {
    const d = await p.findByID({ collection: "content-drafts", id });
    if (d.reviewState === "approved")
      await mutateContent(p, admin, {
        action: "unpublish",
        overrideReason: "Fictional disposable D1 cleanup",
        id,
        revision: d.revision,
      });
    await p.delete({ collection: "content-drafts", id });
  }
  await p.destroy();
}

process.exit(0);
