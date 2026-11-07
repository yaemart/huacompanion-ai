import sharp from "sharp";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = "http://127.0.0.1:3000";
const creds = readFileSync(".local/admin-credentials.txt", "utf8");
const email = creds.match(/邮箱：([^\n]+)/)[1];
const password = creds.match(/密码：([^\n]+)/)[1];
let r = await fetch(base + "/api/staff/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
assert.equal(r.status, 200);
const auth = { Authorization: `JWT ${(await r.json()).token}`, Origin: base };
const post = async (input) => {
  const res = await fetch(base + "/api/content-center", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
};
for (const path of [
  "/api/content-center",
  "/api/content-drafts",
  "/api/content-published",
  "/api/content-agent-tasks",
]) {
  r = await fetch(base + path);
  assert.equal(r.status, 403);
}
r = await fetch(base + "/content-center", { redirect: "manual" });
assert.equal(r.status, 307);
const key = "http-content-" + Date.now();
const body = {
  contentKey: key,
  kind: "guide",
  locale: "en",
  slug: key,
  title: "HTTP published title",
  summary: "Testing only",
  blocks: [{ type: "paragraph", text: "First public text" }],
  sources: [{ id: "s", title: "Source", url: "https://example.com" }],
};
let doc = await post({ action: "save", body });
r = await fetch(base + "/en/guides/" + key);
assert.equal(r.status, 404);
let publicData = await (await fetch(base + "/api/public/content?locale=en")).json();
assert.ok(!publicData.items.some((d) => d.contentKey === key));
r = await fetch(base + "/content-preview/" + doc.id, { redirect: "manual" });
assert.equal(r.status, 307);
const pixel = await sharp({
  create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
})
  .png()
  .toBuffer();
r = await fetch(base + "/api/content-media", {
  method: "POST",
  headers: {
    ...auth,
    "x-image-alt": "Test pixel",
    "x-image-rights": "Generated test fixture",
  },
  body: pixel,
});
assert.equal(r.status, 200);
const media = await r.json();
r = await fetch(base + "/api/content-media/" + media.id);
assert.equal(r.status, 404);
body.blocks.push({ type: "image", mediaId: media.id, text: "Test pixel" });
doc = await post({ action: "save", id: doc.id, revision: doc.revision, body });
doc = await post({ action: "submit", id: doc.id, revision: doc.revision });
doc = await post({
  action: "publish",
  overrideReason: "Local fictional HTTP regression fixture",
  id: doc.id,
  revision: doc.revision,
});
r = await fetch(base + "/en/guides/" + key);
assert.equal(r.status, 200);
let html = await r.text();
assert.ok(html.includes("HTTP published title"));
assert.ok(html.includes("First public text"));
publicData = await (
  await fetch(base + "/api/public/content?locale=en&section=service-process")
).json();
const publicRecord = publicData.items.find((d) => d.contentKey === key);
assert.ok(publicRecord);
assert.equal(typeof publicRecord.publishedAt, "string");
assert.equal(publicRecord.reviewNote, undefined);
assert.equal(publicRecord.createdBy, undefined);
r = await fetch(base + "/api/content-media/" + media.id);
assert.equal(r.status, 200);
assert.equal(r.headers.get("content-type"), "image/webp");
doc = await post({
  action: "save",
  id: doc.id,
  revision: doc.revision,
  body: { ...body, title: "Private changed title" },
});
r = await fetch(base + "/en/guides/" + key);
html = await r.text();
assert.ok(!html.includes("Private changed title"));
assert.ok(html.includes("HTTP published title"));
r = await fetch(base + "/zh/guides/" + key);
assert.equal(r.status, 404);
doc = await post({
  action: "unpublish",
  overrideReason: "Local fictional HTTP regression fixture cleanup",
  id: doc.id,
  revision: doc.revision,
});
r = await fetch(base + "/en/guides/" + key);
assert.equal(r.status, 404);
r = await fetch(base + "/api/content-media/" + media.id);
assert.equal(r.status, 404);
publicData = await (await fetch(base + "/api/public/content?locale=en")).json();
assert.ok(!publicData.items.some((d) => d.contentKey === key));
assert.equal((await fetch(base + "/api/public/content?locale=invalid")).status, 400);
r = await fetch(base + "/api/content-agent", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "create",
    kind: "draft",
    title: "HTTP test task",
    material: "Public test input",
    locale: "en",
    sources: [],
  }),
});
assert.equal(r.status, 200);
assert.equal((await r.json()).status, "unconfigured");
console.log(
  "PASS HTTP: content auth, draft preview protection, new guide route, metadata, old published snapshot, locale isolation, private/public image access, unpublish and unconfigured AI task.",
);
