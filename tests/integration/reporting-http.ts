import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";

if (process.env.APP_ENV !== "local") throw Error("Local HTTP tests only");
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
const password = randomBytes(24).toString("hex");
const email = `report-http-${randomUUID()}@example.invalid`;
const team = await p.create({
  collection: "teams",
  user: admin,
  data: { name: `Reporting HTTP ${randomUUID()}` },
});
const operator = await p.create({
  collection: "staff",
  user: admin,
  data: {
    name: "Fictional reporting HTTP operator",
    email,
    password,
    role: "operations",
    active: true,
    team: team.id,
  },
});
try {
  assert.equal((await fetch(base + "/api/reporting")).status, 403);
  const auth = await p.login({ collection: "staff", data: { email, password } });
  assert.ok(auth.token);
  const cookieHeaders = {
    Cookie: `payload-token=${auth.token}`,
    "Sec-Fetch-Site": "same-origin",
  };
  const page = await fetch(base + "/operations-overview", { headers: cookieHeaders });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("经营概览"));
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await fetch(base + "/api/reporting", { headers: cookieHeaders })).status, 200);
  const headers = {
    Authorization: "JWT " + auth.token,
    Origin: base,
    "Content-Type": "application/json",
  };
  const overview = await fetch(base + "/api/reporting", { headers });
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get("cache-control"), "no-store");
  const body = await overview.json();
  assert.equal("records" in body, false);
  assert.equal("quotes" in body, false);
  const post = (includeSensitive: boolean, origin = base) =>
    fetch(base + "/api/reporting", {
      method: "POST",
      headers: { ...headers, Origin: origin },
      body: JSON.stringify({
        entity: "inquiries",
        filters: { from: "2100-01-01", to: "2100-01-01" },
        includeSensitive,
      }),
    });
  assert.equal((await post(true)).status, 403);
  assert.equal((await post(false, "https://untrusted.invalid")).status, 403);
  const csv = await post(false);
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get("x-export-count"), "0");
  assert.match(csv.headers.get("content-type") || "", /^text\/csv; charset=utf-8$/);
  const bytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes);
  assert.ok(!text.includes("内部备注"));
  assert.ok(!text.includes("内部成本"));
  const audit = await p.find({
    collection: "audit-events",
    where: { and: [{ actor: { equals: operator.id } }, { action: { equals: "csv-export" } }] },
    limit: 1,
  });
  assert.equal(audit.totalDocs, 1);
  assert.equal((audit.docs[0].after as { count: number }).count, 0);
  await p.update({ collection: "staff", id: operator.id, user: admin, data: { active: false } });
  assert.equal((await fetch(base + "/api/reporting", { headers })).status, 403);
  console.log(
    "PASS reporting HTTP auth, revoked account, CSV BOM, default field privacy, origin and audit",
  );
} finally {
  await p.update({ collection: "staff", id: operator.id, user: admin, data: { active: false } });
  await p.destroy();
}
process.exit(0);
