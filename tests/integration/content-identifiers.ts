import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent, readPublished } from "../../src/server/content/service";
import { locales } from "../../src/lib/locales";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_content_identifiers_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const createdPages: number[] = [];
try {
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  const editor = {
    ...admin,
    role: "editor" as const,
    additionalRoles: [],
    contentKinds: ["guide"],
  };
  const token = randomUUID().slice(0, 8);
  const body = {
    kind: "guide",
    locale: "zh",
    title: "虚构上海到达指南",
    blocks: [{ type: "paragraph", text: "仅验收使用" }],
    sources: [{ id: "fixture", title: "虚构来源", url: "https://example.invalid/" }],
  };
  const save = (value: unknown) => mutateContent(p, editor, { action: "save", body: value });
  const chinese = await save({ ...body, slug: "", contentKey: "" });
  assert.match(chinese.contentKey, /^guide-[a-f0-9]{32}$/);
  assert.match(chinese.slug, /^guide-[a-f0-9]{8}$/);
  assert.equal(chinese.reviewState, "draft");

  const title = `Café Airport ${token}`;
  const slug = `cafe-airport-${token}`;
  const [a, b] = await Promise.all([save({ ...body, title }), save({ ...body, title })]);
  assert.notEqual(a.contentKey, b.contentKey);
  assert.deepEqual([a.slug, b.slug].sort(), [slug, `${slug}-2`]);
  const english = await save({ ...body, title, locale: "en" });
  assert.equal(english.slug, slug);
  assert.notEqual(english.contentKey, a.contentKey);
  const paired = await save({
    ...body,
    title: "Translation",
    locale: "en",
    contentKey: a.contentKey,
  });
  assert.equal(paired.contentKey, a.contentKey);
  await assert.rejects(() => save({ ...body, contentKey: a.contentKey }), { status: 409 });
  await assert.rejects(() => save({ ...body, slug }), { status: 409 });
  await assert.rejects(() => save({ ...body, slug: "bad_thing" }));
  await assert.rejects(() => save({ ...body, contentKey: null }));
  await assert.rejects(() => save({ ...body, kind: "page", slug: "privacy" }), { status: 403 });
  const otherKind = await mutateContent(p, admin, {
    action: "save",
    body: {
      ...body,
      kind: "service",
      locale: "en",
      title: `Service ${token}`,
      contentKey: b.contentKey,
    },
  });
  assert.equal(otherKind.contentKey, b.contentKey);
  const reserved = await mutateContent(p, admin, {
    action: "save",
    body: { ...body, kind: "service", locale: "ar", title: "Projects" },
  });
  assert.match(reserved.slug, /^projects-\d+$/);
  await assert.rejects(
    () =>
      mutateContent(p, admin, {
        action: "save",
        body: { ...body, kind: "service", slug: "projects" },
      }),
    { status: 409 },
  );
  const pageDrafts = await p.find({
    collection: "content-drafts",
    where: { kind: { equals: "page" }, slug: { in: ["privacy", "terms"] } },
    limit: 20,
    select: { locale: true, slug: true, contentKey: true },
  });
  const [pageLocale, secondLocale] = locales.filter(
    (locale) => !pageDrafts.docs.some((d) => d.locale === locale),
  );
  assert.ok(pageLocale && secondLocale);
  const fixed = { ...body, kind: "page", locale: pageLocale, slug: "privacy" };
  const page = await mutateContent(p, admin, { action: "save", body: fixed });
  createdPages.push(page.id);
  assert.equal(
    page.contentKey,
    pageDrafts.docs.find((d) => d.slug === "privacy")?.contentKey ?? "page-privacy",
  );
  assert.equal(page.slug, "privacy");
  await assert.rejects(
    () =>
      mutateContent(p, admin, {
        action: "save",
        id: page.id,
        revision: page.revision,
        body: {
          ...fixed,
          contentKey: page.contentKey,
          slug: "terms",
        },
      }),
    { status: 409 },
  );
  await assert.rejects(
    () =>
      mutateContent(p, admin, {
        action: "save",
        body: { ...fixed, locale: secondLocale, contentKey: "page-terms" },
      }),
    { status: 409 },
  );
  await assert.rejects(() => mutateContent(p, admin, { action: "save", body: fixed }), {
    status: 409,
    message: /打开原稿/,
  });
  await assert.rejects(() =>
    mutateContent(p, admin, { action: "save", body: { ...fixed, slug: "" } }),
  );

  await p.create({
    collection: "content-published",
    data: {
      draftId: 1000000000 + Number.parseInt(token.slice(0, 7), 16),
      routeKey: `guide:zh:archived-${token}`,
      active: false,
      revision: 1,
      body: { ...body, contentKey: `archived-${token}`, slug: `archived-${token}` },
      publishedBy: admin.id,
      publishedAt: new Date().toISOString(),
    },
  });
  const archived = await save({ ...body, title: `Archived ${token}` });
  assert.equal(archived.slug, `archived-${token}-2`);

  const current = { ...body, slug: chinese.slug, contentKey: chinese.contentKey };
  const command = (action: string, revision: number, extra = {}) =>
    mutateContent(p, admin, { action, id: chinese.id, revision, ...extra });
  const history = await p.findVersions({
    collection: "content-drafts",
    where: { parent: { equals: chinese.id } },
    limit: 1,
  });
  const submitted = await command("submit", chinese.revision);
  await assert.rejects(() => command("save", submitted.revision, { body: current }), {
    status: 409,
  });
  const published = await command("publish", submitted.revision, { overrideReason: "虚构验收" });
  assert.equal((await readPublished(p, "guide", "zh", chinese.slug))?.title, body.title);
  await assert.rejects(() =>
    command("save", published.revision, { body: { ...current, slug: "changed" } }),
  );
  await assert.rejects(() =>
    command("save", published.revision, { body: { ...current, contentKey: "" } }),
  );
  const edited = await command("save", published.revision, {
    body: { ...current, title: "改标题不改网址" },
  });
  assert.equal(edited.slug, chinese.slug);
  const restored = await command("restore", edited.revision, { versionId: history.docs[0].id });
  assert.equal(restored.slug, chinese.slug);
  assert.equal(restored.title, body.title);
  assert.equal((await readPublished(p, "guide", "zh", chinese.slug))?.title, body.title);
  console.log(
    "PASS automatic identifiers, collisions, scope, bilingual grouping and old public URLs",
  );
} finally {
  for (const id of createdPages) await p.delete({ collection: "content-drafts", id });
  await p.destroy();
}
process.exit(0);
