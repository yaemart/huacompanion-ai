import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:3000";
let count = 0;
const check = (name) => {
  count++;
  console.log("PASS " + name);
};
for (const suffix of ["first-register", "FIRST-REGISTER", "%66irst-register"]) {
  const res = await fetch(`${base}/api/staff/${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 403);
}
check("all first-registration aliases are blocked");
for (const collection of [
  "inquiries",
  "providers",
  "notifications",
  "audit-events",
]) {
  const res = await fetch(`${base}/api/${collection}`);
  assert.equal(res.status, 403);
}
check("anonymous cannot read business collections");
const payload = {
  kind: "request",
  locale: "zh",
  values: {
    categories: ["transport"],
    city: "上海",
    people: "2",
    datesUnknown: true,
    name: "HTTP虚构测试",
    email: "http-test@example.com",
    language: "中文",
    consent: true,
  },
};
const key = randomUUID();
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  "Idempotency-Key": key,
};
let res = await fetch(`${base}/api/intake`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});
assert.equal(res.status, 201);
const saved = await res.json();
assert.match(saved.reference, /^HC-Q-/);
check("HTTP form returns a real receipt");
res = await fetch(`${base}/api/intake`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});
assert.equal(res.status, 200);
assert.equal((await res.json()).reference, saved.reference);
check("HTTP retry returns the same receipt");
res = await fetch(`${base}/api/intake`, {
  method: "POST",
  headers: { ...headers, Origin: "https://untrusted.invalid" },
  body: JSON.stringify(payload),
});
assert.equal(res.status, 403);
check("cross-origin intake rejected");
const creds = readFileSync(".local/admin-credentials.txt", "utf8");
const email = creds.match(/邮箱：([^\n]+)/)[1];
const password = creds.match(/密码：([^\n]+)/)[1];
res = await fetch(`${base}/api/staff/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
assert.equal(res.status, 200);
const login = await res.json();
assert.ok(login.token);
const auth = { Authorization: `JWT ${login.token}` };
check("real administrator authentication works");
res = await fetch(
  `${base}/api/inquiries?where[reference][equals]=${encodeURIComponent(saved.reference)}`,
  { headers: auth },
);
assert.equal(res.status, 200);
const found = await res.json();
assert.equal(found.totalDocs, 1);
assert.equal(found.docs[0].name, payload.values.name);
check("saved form visible through authenticated backend API");
res = await fetch(`${base}/api/staff/logout`, {
  method: "POST",
  headers: auth,
});
assert.equal(res.status, 200);
check("logout endpoint works");
console.log(`${count} HTTP checks passed. No credentials printed.`);
