import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyExhibition, shanghaiToday } from "../../src/lib/exhibitions";
import { mutateContent } from "../../src/server/content/service";
import { locales } from "../../src/lib/locales";
import { parseSiteLocales } from "../../src/lib/site-locales";

const database = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.APP_ENV !== "local" ||
  database.hostname !== "127.0.0.1" ||
  database.port !== "55438" ||
  database.pathname !== "/hua_companion"
) {
  throw Error(
    "Refusing to test outside the dedicated local database at 127.0.0.1:55438/hua_companion",
  );
}
const base = "http://127.0.0.1:3000";
const activeLocales = parseSiteLocales(process.env.SITE_LOCALES);
const p = await getPayload({ config });
let draftId: number | undefined;
let admin: any;
const key = `exhibition-http-${Date.now()}`;
const title = "Fictional HTTP exhibition <test> & source";
const escapedTitle = "Fictional HTTP exhibition &lt;test&gt; &amp; source";
const event = {
  ...emptyExhibition(),
  edition: "HTTP fixture 2090",
  city: "shanghai",
  venue: "Fictional test venue",
  address: "Fictional test address",
  startDate: "2090-01-30",
  endDate: "2090-02-02",
  audience: "Fictional buyers",
  exhibits: "Test hardware only",
  admission: "Fictional registration instructions",
  officialURL: "https://example.invalid/fictional-http-exhibition",
  verifiedAt: shanghaiToday(),
  industries: ["hardware"],
  status: "announced" as const,
};
const body = {
  kind: "exhibition",
  locale: "en",
  contentKey: key,
  slug: key,
  title,
  summary: "TEST ONLY — not a real exhibition",
  order: -100000,
  blocks: [
    { type: "paragraph", text: "Fictional local HTTP fixture. Never use as travel information." },
  ],
  sources: [
    {
      id: "official",
      title: "Fictional official test source",
      url: event.officialURL,
      checkedAt: event.verifiedAt,
    },
  ],
  exhibition: event,
};
async function html(path: string, status = 200) {
  const response = await fetch(base + path, { cache: "no-store" });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${response.status}`);
  return text;
}
async function json(path: string, status = 200) {
  const response = await fetch(base + path, { cache: "no-store" });
  assert.equal(response.status, status, `${path}: ${response.status}`);
  return response.json();
}
async function publish(nextBody: any) {
  const current = draftId
    ? await p.findByID({ collection: "content-drafts", id: draftId })
    : undefined;
  let d = await mutateContent(p, admin, {
    action: "save",
    body: nextBody,
    id: draftId,
    revision: current?.revision,
  });
  draftId = d.id;
  d = await mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
  return mutateContent(p, admin, {
    action: "publish",
    overrideReason: "Local regression fixture review and cleanup",
    id: d.id,
    revision: d.revision,
    exhibitionReviewed: true,
  });
}
try {
  admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin, "Local administrator required");
  await publish(body);
  const published = (
    await p.find({
      collection: "content-published",
      where: { draftId: { equals: draftId } },
      limit: 1,
    })
  ).docs[0];
  assert.ok(
    (await html("/en/exhibitions?q=Fictional%20HTTP%20exhibition")).includes(escapedTitle),
    "List renders escaped title",
  );
  const detail = await html(`/en/exhibitions/${key}`);
  assert.ok(detail.includes(escapedTitle));
  assert.ok(!detail.includes(title), "Raw title must not enter HTML or JSON-LD");
  assert.ok(detail.includes("application/ld+json"));
  assert.ok(detail.includes("\\u003ctest>"), "JSON-LD escapes less-than characters");
  const api = await json(`/api/public/exhibitions?locale=en&key=${key}`);
  assert.equal(api.total, 1);
  assert.equal(api.items[0].title, title);
  assert.equal(api.items[0].path, `/en/exhibitions/${key}`);
  assert.equal(api.items[0].exhibition.officialURL, event.officialURL);
  assert.equal(api.items[0].exhibition.verifiedAt, event.verifiedAt);
  assert.equal(api.items[0].sources[0].checkedAt, event.verifiedAt);
  assert.equal(api.items[0].exhibition.startDate, event.startDate);
  assert.equal(api.items[0].exhibition.endDate, event.endDate);
  const content = await json("/api/public/content?locale=en");
  assert.equal(
    content.items.find((d: any) => d.contentKey === key)?.path,
    `/en/exhibitions/${key}`,
  );
  assert.ok((await html("/sitemap.xml")).includes(`/en/exhibitions/${key}`));
  const request = await html(`/en/request?exhibition=${key}`);
  assert.ok(request.includes(escapedTitle));
  assert.ok(request.includes(event.startDate) && request.includes(event.endDate));
  assert.match(request, /(?:value="Shanghai"|value="Shanghai"[^>]*selected)/);
  assert.match(request.replace(/\\"/g, '"'), /"initialService":"business"/);
  assert.ok(request.replace(/\\"/g, '"').includes(`"exhibitionRevision":${published.revision}`));
  const preview = await fetch(`${base}/content-preview/${draftId}`, { redirect: "manual" });
  assert.ok([303, 307, 308].includes(preview.status));
  assert.equal(new URL(preview.headers.get("location")!, base).pathname, "/admin/login");
  for (const locale of locales) {
    if (!activeLocales.includes(locale)) {
      await html(`/${locale}/exhibitions`, 404);
      await html(`/${locale}/exhibitions/${key}`, 404);
      await json(`/api/public/exhibitions?locale=${locale}`, 400);
      await json(`/api/public/exhibitions?locale=${locale}&key=${key}`, 400);
      assert.ok(!detail.includes(`href="/${locale}/exhibitions/${key}"`));
      continue;
    }
    const publicList = await json(`/api/public/exhibitions?locale=${locale}`);
    assert.equal(publicList.locale, locale);
    assert.ok(publicList.items.every((item: { locale: string }) => item.locale === locale));
    const page = await html(`/${locale}/exhibitions`);
    assert.match(page, new RegExp(`<html[^>]*lang="${locale === "zh" ? "zh-CN" : locale}"`));
    assert.match(page, new RegExp(`<html[^>]*dir="${locale === "ar" ? "rtl" : "ltr"}"`));
    const switcher = page.match(/<select[^>]*class="language"[^>]*>[\s\S]*?<\/select>/)?.[0];
    assert.ok(switcher);
    for (const option of locales)
      assert.equal(switcher.includes(`value="${option}"`), activeLocales.includes(option));
  }
  await publish({ ...body, exhibition: { ...event, status: "cancelled" } });
  const cancelled = await html(`/en/request?exhibition=${key}`);
  assert.ok(cancelled.includes("The selected exhibition is unavailable"));
  assert.match(cancelled, /<fieldset[^>]*disabled/);
  const cancelledAPI = await json(`/api/public/exhibitions?locale=en&key=${key}`);
  assert.equal(cancelledAPI.items[0].inquiryPath, null);
  const current = await p.findByID({ collection: "content-drafts", id: draftId! });
  await mutateContent(p, admin, {
    action: "unpublish",
    overrideReason: "Local regression fixture review and cleanup",
    id: draftId,
    revision: current.revision,
  });
  await json(`/api/public/exhibitions?locale=en&key=${key}`, 404);
  await html(`/en/exhibitions/${key}`, 404);
  console.log(
    "PASS exhibitions HTTP: escaped list/detail, API sources, public paths, sitemap, attributed prefill, private preview, active locales, inactive rejection, cancellation and withdrawal",
  );
} finally {
  try {
    if (draftId && admin) {
      const current = await p.findByID({ collection: "content-drafts", id: draftId });
      await mutateContent(p, admin, {
        action: "unpublish",
        overrideReason: "Local regression fixture review and cleanup",
        id: draftId,
        revision: current.revision,
      });
    }
  } finally {
    await p.destroy();
  }
}

process.exit(0);
