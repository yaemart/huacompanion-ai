import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw new Error("Local test database required");
if (process.env.TRUSTED_PROXY) throw new Error("HTTP regression requires cookie fallback mode");
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const base = process.env.APP_URL || "http://127.0.0.1:3000";
const run = randomUUID();
const common = {
  categories: ["transport"],
  city: "Shanghai",
  people: "2",
  datesUnknown: true,
  name: `Intake protection ${run}`,
  email: `intake-${run}@example.com`,
  language: "English",
  consent: true,
};
const bodies = [
  { kind: "request", locale: "en", values: common },
  {
    kind: "apply",
    locale: "en",
    values: {
      ...common,
      organisation: "Fictional partner",
      phone: "00000000000",
      languages: "English",
      capabilities: "Fictional transport coordination",
      website: "https://provider.example",
    },
  },
];
async function post(
  input: unknown,
  key = randomUUID(),
  cookie = "",
  extra: Record<string, string> = {},
) {
  return fetch(`${base}/api/intake`, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      Cookie: cookie,
      ...extra,
    },
    body: JSON.stringify(input),
  });
}
async function globalCount() {
  const result = await database.query(
    "SELECT COALESCE(SUM(count), 0) AS count FROM intake_limits WHERE client_key='global'",
  );
  return Number(result.rows[0].count);
}
try {
  for (const path of ["request", "apply"]) {
    const page = await fetch(`${base}/en/${path}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<div hidden="" aria-hidden="true">[^]*?name="contactFax"/);
    assert.match(html, /<input[^>]*id="contactFax"[^>]*autoComplete="off"[^>]*tabindex="-1"/i);
  }
  console.log(
    "PASS both public forms render a hidden honeypot outside keyboard and accessibility navigation",
  );
  const before = await globalCount();
  const notifications = Number(
    (await database.query("SELECT count(*) FROM notifications")).rows[0].count,
  );
  for (const body of bodies) {
    const rejected = await post({ ...body, contactFax: "bot-filled" });
    assert.equal(rejected.status, 400);
  }
  assert.equal(await globalCount(), before);
  for (const table of ["inquiries", "providers"]) {
    const result = await database.query(`SELECT count(*) FROM ${table} WHERE email=$1`, [
      common.email,
    ]);
    assert.equal(Number(result.rows[0].count), 0);
  }
  assert.equal(
    Number((await database.query("SELECT count(*) FROM notifications")).rows[0].count),
    notifications,
  );
  console.log("PASS both honeypots prevent customer records, notifications, and quota consumption");
  for (const body of bodies) {
    const key = randomUUID();
    const response = await post({ ...body, contactFax: "" }, key);
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const receipt = await response.json();
    assert.match(receipt.reference, body.kind === "request" ? /^HC-Q-/ : /^HC-P-/);
    const retry = await post({ ...body, contactFax: "" }, key, cookie);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).reference, receipt.reference);
    const table = body.kind === "request" ? "inquiries" : "providers";
    const records = await database.query(`SELECT details FROM ${table} WHERE reference=$1`, [
      receipt.reference,
    ]);
    assert.equal(records.rows.length, 1);
    assert.equal(Object.hasOwn(records.rows[0].details, "contactFax"), false);
    if ("website" in body.values)
      assert.equal(records.rows[0].details.website, body.values.website);
  }
  console.log(
    "PASS both form paths keep idempotent receipts and business fields; technical field never stored",
  );
  // Invalid submissions count as attempts; one persistent client cannot consume the shared cap after 60.
  const first = await post({});
  assert.equal(first.status, 400);
  const cookie = first.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const start = await globalCount();
  for (let i = 1; i < 60; i++) assert.equal((await post({}, randomUUID(), cookie)).status, 400);
  const exhausted = await post({}, randomUUID(), cookie, {
    "CF-Connecting-IP": "1.2.3.4",
    "X-Forwarded-For": "8.8.8.8",
  });
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.headers.get("retry-after"), "600");
  assert.equal(await globalCount(), start + 59);
  assert.equal((await post({}, randomUUID(), cookie)).status, 429);
  assert.equal(await globalCount(), start + 59);
  const other = await post({});
  assert.equal(other.status, 400);
  assert.ok(other.headers.get("set-cookie"));
  console.log(
    "PASS validation cookies persist, forged IP cannot bypass exhaustion, other client remains eligible",
  );
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const suffix = ["PATCH", "DELETE"].includes(method) ? "?where[clientKey][equals]=forged" : "";
    const response = await fetch(`${base}/api/intake-limits${suffix}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: base },
      ...(method !== "GET"
        ? { body: JSON.stringify({ bucket: 1, clientKey: "forged", count: 0 }) }
        : {}),
    });
    assert.equal(response.status, 403);
  }
  console.log("PASS public intake-limit collection remains inaccessible for all CRUD methods");
} finally {
  await database.end();
}
