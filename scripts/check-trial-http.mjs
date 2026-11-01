import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (process.env.APP_ENV !== "local" || !base.startsWith("http://127.0.0.1:"))
  throw Error("Local trial-profile HTTP verification only");
for (const locale of ["zh", "en"]) {
  const response = await fetch(`${base}/${locale}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  assert.ok(!header.includes(`href="/${locale}/account"`));
  assert.ok(!header.includes(`href="/${locale}/support"`));
  assert.ok(header.includes(`href="/${locale}/request"`));
}
const support = await (await fetch(base + "/api/support")).json();
for (const [key, feature] of Object.entries(support.features)) {
  assert.equal(feature.enabled, false, key);
  assert.equal(feature.available, false, key);
}
const customer = await (await fetch(base + "/api/customer")).json();
assert.equal(customer.available, false);
for (const [endpoint, body] of [
  ["support", { action: "start", key: randomUUID(), locale: "en" }],
  ["customer", { action: "request", locale: "en", email: "trial-test@example.invalid" }],
]) {
  const response = await fetch(`${base}/api/${endpoint}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 503, endpoint);
}
console.log(
  "PASS trial profile: hidden customer/support navigation, form entry retained, all support features closed, customer verification and support APIs blocked",
);
