import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyInstitution } from "../../src/lib/institutions";
import { shanghaiToday } from "../../src/lib/exhibitions";
import { mutateContent } from "../../src/server/content/service";
import { locales } from "../../src/lib/locales";
import { institutionText } from "../../src/lib/institution-copy";
import { coreText } from "../../src/lib/core-copy";

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
const p = await getPayload({ config });
let draftId: number | undefined;
let admin: any;
const key = `institution-http-${Date.now()}`;
const title = "Fictional HTTP institution <test> & source";
const escapedTitle = "Fictional HTTP institution &lt;test&gt; &amp; source";
const institution = {
  ...emptyInstitution(),
  type: "medical" as const,
  city: "shanghai",
  address: "Fictional address",
  addressEn: "Fictional English address",
  directions: "Fictional coordination-only service",
  audience: "Fictional adult visitors",
  appointment: "Fictional appointment process",
  preparation: "Fictional preparation instructions",
  fees: "Fictional price to confirm",
  foreignAcceptance: "confirmed" as const,
  acceptanceConditions: "Fictional conditions only",
  languages: ["en"],
  interpretation: "Fictional interpretation arrangements",
  officialURL: "https://example.invalid/fictional-http-institution",
  verifiedAt: shanghaiToday(),
  qualification: "Fictional verification note; no real accreditation claimed",
  unresolved: "Fictional test data only",
};
const body = {
  kind: "institution",
  locale: "en",
  contentKey: key,
  slug: key,
  title,
  summary: "TEST ONLY — not a real institution",
  order: -100000,
  blocks: [
    { type: "paragraph", text: "Fictional local HTTP fixture. Never use as medical information." },
  ],
  sources: [
    {
      id: "official",
      title: "Fictional official test source",
      url: institution.officialURL,
      checkedAt: institution.verifiedAt,
    },
  ],
  institution,
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
    institutionReviewed: true,
  });
}
function publicOnly(item: any) {
  for (const field of [
    "providerRef",
    "draftId",
    "reviewNote",
    "reviewState",
    "createdBy",
    "updatedBy",
    "internalNotes",
  ])
    assert.equal(item[field], undefined, `${field} stays private`);
  assert.equal(item.institution.contact, undefined);
  assert.equal(item.institution.contactEmail, undefined);
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
  const listing = await html(
    "/en/institutions?q=Fictional%20HTTP%20institution&type=medical&city=shanghai&language=en&direction=coordination",
  );
  assert.ok(listing.includes(escapedTitle));
  await html("/en/institutions?q=Fictional&q=other&direction=coordination&direction=other");
  const detail = await html(`/en/institutions/${key}`);
  assert.ok(detail.includes(escapedTitle));
  assert.ok(!detail.includes(title));
  assert.ok(detail.includes("application/ld+json") && detail.includes("\\u003ctest>"));
  assert.ok(detail.includes(institution.qualification) && detail.includes(institution.officialURL));
  assert.ok(detail.includes(`href="/en/request?institution=${key}"`));
  const api = await json(`/api/public/institutions?locale=en&key=${key}`);
  assert.equal(api.total, 1);
  const item = api.items[0];
  assert.equal(item.title, title);
  assert.equal(item.path, `/en/institutions/${key}`);
  assert.equal(item.institution.officialURL, institution.officialURL);
  assert.equal(item.institution.verifiedAt, institution.verifiedAt);
  assert.equal(item.sources[0].checkedAt, institution.verifiedAt);
  assert.equal(new URL(item.inquiryPath, base).searchParams.get("institution"), key);
  publicOnly(item);
  const apiList = await json(
    "/api/public/institutions?locale=en&type=medical&language=en&q=Fictional%20HTTP%20institution",
  );
  assert.equal(apiList.total, 1);
  publicOnly(apiList.items[0]);
  assert.equal(
    (await json("/api/public/institutions?locale=en&language=ar&q=Fictional%20HTTP%20institution"))
      .total,
    0,
  );
  const content = await json("/api/public/content?locale=en");
  assert.equal(
    content.items.find((d: any) => d.contentKey === key)?.path,
    `/en/institutions/${key}`,
  );
  assert.ok((await html("/sitemap.xml")).includes(`/en/institutions/${key}`));
  const request = await html(`/en/request?institution=${key}`);
  assert.ok(request.includes(escapedTitle));
  assert.match(request, /value="Shanghai"/);
  assert.match(request.replace(/\\"/g, '"'), /"initialService":"medical"/);
  assert.ok(request.replace(/\\"/g, '"').includes(`"institutionRevision":${published.revision}`));
  assert.doesNotMatch(request, /<fieldset[^>]*disabled/);
  const preview = await fetch(`${base}/content-preview/${draftId}`, { redirect: "manual" });
  assert.ok([303, 307, 308].includes(preview.status));
  assert.equal(new URL(preview.headers.get("location")!, base).pathname, "/admin/login");
  for (const locale of locales) {
    const page = await html(`/${locale}/institutions?q=no-match-${key}`);
    assert.match(page, new RegExp(`<html[^>]*lang="${locale === "zh" ? "zh-CN" : locale}"`));
    assert.match(page, new RegExp(`<html[^>]*dir="${locale === "ar" ? "rtl" : "ltr"}"`));
    assert.ok(page.includes(institutionText(locale, "empty")));
    assert.ok(page.includes(`href="/${locale}/institutions"`));
    assert.ok(page.includes(coreText(locale, "Institutions")));
    if (locale !== "en") {
      await html(`/${locale}/institutions/${key}`, 404);
      await json(`/api/public/institutions?locale=${locale}&key=${key}`, 404);
      assert.ok(
        !detail.includes(`href="/${locale}/institutions/${key}"`),
        "Missing translation must not link to an unrelated slug",
      );
    }
  }
  for (const state of ["pending", "paused"] as const) {
    await publish({ ...body, institution: { ...institution, foreignAcceptance: state } });
    const blockedDetail = await html(`/en/institutions/${key}`);
    assert.ok(blockedDetail.includes(institutionText("en", state)));
    assert.ok(!blockedDetail.includes(`href="/en/request?institution=${key}`));
    assert.ok(blockedDetail.includes('href="/en/request"'));
    const blocked = await html(`/en/request?institution=${key}`);
    assert.match(blocked, /<fieldset[^>]*disabled/);
    assert.equal(
      (await json(`/api/public/institutions?locale=en&key=${key}`)).items[0].inquiryPath,
      null,
    );
  }
  const current = await p.findByID({ collection: "content-drafts", id: draftId! });
  await mutateContent(p, admin, {
    action: "unpublish",
    overrideReason: "Local regression fixture review and cleanup",
    id: draftId,
    revision: current.revision,
  });
  await json(`/api/public/institutions?locale=en&key=${key}`, 404);
  await html(`/en/institutions/${key}`, 404);
  console.log(
    "PASS institutions HTTP: escaped public pages, sources/privacy, filters, sitemap, " +
      "attributed medical prefill, revision, private preview, seven locales/RTL, exact " +
      "translation identity, pending/paused and withdrawal",
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
