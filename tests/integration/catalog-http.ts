import "dotenv/config";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { saveIntake } from "../../src/server/intake";
import { emptyCatalog } from "../../src/lib/catalog";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
if (process.env.APP_ENV !== "local") throw Error("Local tests only");
const base = "http://127.0.0.1:3000",
  p = await getPayload({ config });
const creds = readFileSync(".local/admin-credentials.txt", "utf8");
const login = await fetch(base + "/api/staff/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: creds.match(/邮箱：([^\n]+)/)![1],
    password: creds.match(/密码：([^\n]+)/)![1],
  }),
});
assert.equal(login.status, 200);
const auth = {
  Authorization: "JWT " + (await login.json()).token,
  Origin: base,
};
const post = async (input: any) => {
  const r = await fetch(base + "/api/content-center", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
};
const key = "http-catalog-" + Date.now();
const drafts: number[] = [];
const apply = await saveIntake(
  {
    kind: "apply",
    locale: "en",
    values: {
      name: "Fictional HTTP",
      email: "fixture@example.com",
      categories: ["business"],
      city: "Shanghai",
      organisation: "Fictional HTTP catalog",
      phone: "private-phone-marker",
      languages: "en",
      capabilities: "Fictional only",
      consent: true,
    },
  },
  randomUUID(),
);
const provider = (
  await p.find({
    collection: "providers",
    where: { reference: { equals: apply.reference } },
    limit: 1,
  })
).docs[0];
try {
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { status: "verified", publicApproved: true },
  });
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const upload = await fetch(base + "/api/content-media", {
    method: "POST",
    headers: {
      ...auth,
      "x-image-alt": "Fictional pixel",
      "x-image-rights": "Own test image",
      "Content-Type": "image/png",
    },
    body: image,
  });
  assert.equal(upload.status, 200);
  const media = await upload.json();
  const c = {
    ...emptyCatalog(),
    categories: ["business"],
    cities: [{ code: "shanghai", name: "Shanghai" }],
    languages: ["en"],
    capabilities: "Fictional public capability",
  };
  const b = {
    kind: "provider-profile",
    contentKey: key,
    slug: key,
    locale: "en",
    title: "Fictional HTTP provider",
    summary: "Test only",
    blocks: [{ type: "image", mediaId: media.id, text: "Test only" }],
    sources: [],
    catalog: c,
  };
  let d = await post({ action: "save", body: b, providerRef: provider.id });
  drafts.push(d.id);
  assert.equal((await fetch(base + "/en/providers/" + key)).status, 404);
  d = await post({ action: "submit", id: d.id, revision: d.revision });
  await post({
    action: "publish",
    id: d.id,
    revision: d.revision,
    catalogReviewed: true,
  });
  const item = await fetch(base + "/api/public/catalog?locale=en&key=" + key);
  assert.equal(item.status, 200);
  const data = await item.json();
  assert.equal(data.items[0].path, "/en/providers/" + key);
  assert.ok(!JSON.stringify(data).includes("private-phone-marker"));
  assert.equal(data.items[0].providerRef, undefined);
  assert.equal(
    (await fetch(base + "/api/content-media/" + media.id)).status,
    200,
  );
  let html = await (await fetch(base + "/en/providers/" + key)).text();
  assert.ok(html.includes("application/ld+json"));
  assert.ok(html.includes("Fictional HTTP provider"));
  assert.ok(!html.includes("private-phone-marker"));
  html = await (
    await fetch(base + "/en/request?provider=" + key + "&service=business")
  ).text();
  assert.ok(html.includes("Fictional HTTP provider"));
  assert.equal((await fetch(base + "/zh/providers/" + key)).status, 404);
  assert.ok(
    (await (await fetch(base + "/sitemap.xml")).text()).includes(
      "/en/providers/" + key,
    ),
  );
  for (const path of [
    "/api/public/catalog?locale=bad",
    "/api/public/catalog?page=0",
    "/api/public/catalog?category=bad",
  ])
    assert.equal((await fetch(base + path)).status, 400);
  assert.equal(
    (
      await fetch(
        base + "/api/public/catalog?locale=en&city=unknown&key=" + key,
      )
    ).status,
    404,
  );
  const body = {
    ...b,
    kind: "service-project",
    slug: key + "-project",
    contentKey: key + "-project",
    title: "Fictional HTTP project",
    blocks: [{ type: "paragraph", text: "Test only" }],
    catalog: {
      ...c,
      audience: "Buyers",
      includes: "Support",
      excludes: "Transport",
      process: "Confirm then arrange",
      deliverables: "Notes",
      materials: "Brief",
      bookingNotice: "Confirm",
      duration: "By proposal",
      people: "By proposal",
      changes: "By proposal",
      fulfillment: "specified",
      providerKeys: [key],
    },
  };
  let project = await post({ action: "save", body });
  drafts.push(project.id);
  project = await post({
    action: "submit",
    id: project.id,
    revision: project.revision,
  });
  await post({
    action: "publish",
    id: project.id,
    revision: project.revision,
    catalogReviewed: true,
  });
  const request = {
    kind: "request",
    locale: "en",
    source: { provider: key, project: key + "-project" },
    values: {
      name: "Fictional customer",
      email: "fixture@example.com",
      categories: ["business"],
      city: "Shanghai",
      people: "1",
      datesUnknown: true,
      language: "English",
      consent: true,
    },
  };
  const send = async (body: any, id: string) =>
    fetch(base + "/api/intake", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
      },
      body: JSON.stringify(body),
    });
  const id = randomUUID();
  let r = await send(request, id);
  assert.equal(r.status, 201, await r.text());
  assert.equal((await send(request, id)).status, 200);
  assert.equal(
    (await send({ ...request, source: { provider: key } }, id)).status,
    409,
  );
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { publicApproved: false, status: "paused" },
  });
  assert.equal((await fetch(base + "/en/providers/" + key)).status, 404);
  assert.equal(
    (await fetch(base + "/api/content-media/" + media.id)).status,
    404,
  );
  assert.equal(
    (await fetch(base + "/api/public/catalog?locale=en&key=" + key)).status,
    404,
  );
  assert.ok(
    !(await (await fetch(base + "/sitemap.xml")).text()).includes(
      "/en/providers/" + key,
    ),
  );
  assert.equal((await send(request, randomUUID())).status, 400);
  html = await (await fetch(base + "/en/request?provider=" + key)).text();
  assert.ok(html.includes("unavailable or incompatible"));
  html = await (
    await fetch(base + "/en/services/projects/" + key + "-project")
  ).text();
  assert.ok(html.includes("Enquiries for this arrangement are paused"));
  console.log(
    "PASS catalog HTTP: publication, JSON-LD, source prefill, linked submission, retries, media revocation, sitemap and locale isolation",
  );
} finally {
  for (const id of drafts) {
    const d = await p.findByID({ collection: "content-drafts", id });
    await post({ action: "unpublish", id, revision: d.revision });
  }
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { publicApproved: false, status: "paused" },
  });
  await p.destroy();
}
process.exit(0);
