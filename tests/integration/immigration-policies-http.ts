import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import type { Staff } from "../../payload-types";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
if (process.env.APP_ENV !== "local" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Local policy HTTP tests only");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    limit: 1,
    sort: "createdAt",
  })
).docs[0];
assert.ok(admin);
const key = `policy-http-${randomUUID()}`;
const password = randomUUID();
const actors: number[] = [];
const blockedTokens: (string | undefined)[] = [undefined];
let id: number | undefined;
async function request(path: string, token?: string, method = "GET", data?: object) {
  return fetch(base + "/api/immigration-policies" + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `JWT ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
async function denied(path: string, token?: string, method = "GET", data?: object) {
  const result = await request(path, token, method, data);
  assert.ok([401, 403].includes(result.status), `${method} ${path}: ${result.status}`);
  assert.ok(!(await result.text()).includes("Private HTTP fixture"));
}
try {
  const policy = await p.create({
    collection: "immigration-policies",
    data: {
      policyKey: key,
      status: "draft",
      revision: 1,
      internalNotes: "Private HTTP fixture",
    },
  });
  id = policy.id;
  for (const path of ["", `/${id}`, "/count", "/versions"]) await denied(path);
  console.log("PASS anonymous REST policy list, detail and versions denied");

  let adminToken: string | undefined;
  let localAdmin: Staff | undefined;
  for (const role of ["editor", "reviewer", "operations", "admin"] as const) {
    const actor = await p.create({
      collection: "staff",
      user: admin,
      data: {
        name: "Fictional policy HTTP tester",
        email: `${key}-${role}@example.invalid`,
        password,
        role,
        active: true,
        contentKinds: [],
      },
    });
    actors.push(actor.id);
    const login = await p.login({ collection: "staff", data: { email: actor.email, password } });
    assert.ok(login.token);
    if (role === "admin") {
      adminToken = login.token;
      localAdmin = actor;
    } else {
      blockedTokens.push(login.token);
      await denied("", login.token);
      await denied(`/${id}`, login.token);
      await denied("/versions", login.token);
    }
  }
  console.log("PASS real editor/reviewer/operator JWTs cannot read policy or version data");
  assert.ok(adminToken && localAdmin);
  const allowed = await request(`/${id}`, adminToken);
  assert.equal(allowed.status, 200);
  const allowedBody: unknown = await allowed.json();
  assert.ok(allowedBody && typeof allowedBody === "object" && "internalNotes" in allowedBody);
  assert.equal(allowedBody.internalNotes, "Private HTTP fixture");
  const versions = await request("/versions", adminToken);
  assert.equal(versions.status, 200);
  const history: unknown = await versions.json();
  assert.ok(
    history && typeof history === "object" && "docs" in history && Array.isArray(history.docs),
  );
  const version: unknown = history.docs[0];
  assert.ok(version && typeof version === "object" && "id" in version);
  assert.ok(typeof version.id === "string" || typeof version.id === "number");
  assert.equal((await request(`/versions/${version.id}`, adminToken)).status, 200);
  for (const token of blockedTokens) await denied(`/versions/${version.id}`, token);
  for (const token of [undefined, adminToken]) {
    await denied("", token, "POST", {
      policyKey: `${key}-denied`,
      status: "published",
      revision: 2,
    });
    await denied(`/${id}`, token, "PATCH", { status: "published" });
    await denied(`/${id}`, token, "DELETE");
    await denied(`/versions/${version.id}`, token, "POST");
  }
  console.log("PASS administrator reads only; generic REST and version restore cannot publish");
  await p.update({ collection: "staff", id: localAdmin.id, data: { active: false }, user: admin });
  await denied(`/${id}`, adminToken);
  await denied("/versions", adminToken);
  const unchanged = await p.findByID({ collection: "immigration-policies", id });
  assert.equal(unchanged.status, "draft");
  assert.equal(unchanged.revision, 1);
  console.log("PASS existing JWT loses policy access after deactivation; no mutation occurred");
} finally {
  if (id) await p.delete({ collection: "immigration-policies", id, overrideAccess: true });
  for (const actor of actors) await p.delete({ collection: "staff", id: actor, user: admin });
  await p.destroy();
}
process.exit(0);
