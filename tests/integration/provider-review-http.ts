import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
const url = new URL(process.env.DATABASE_URL || ""),
  base = process.env.APP_URL || "";
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_provider_review_e5_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const p = await getPayload({ config }),
  run = `e5http-${randomUUID()}`,
  password = randomUUID();
const staffIDs: number[] = [],
  teamIDs: number[] = [];
let providerID: number | undefined;
try {
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password, role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({ collection: "teams", user: admin, data: { name: run } }),
    foreign = await p.create({ collection: "teams", user: admin, data: { name: run + "f" } });
  teamIDs.push(team.id, foreign.id);
  const staff = async (name: string, role: "manager" | "operations", teamID = team.id) => {
    const user = await p.create({
      collection: "staff",
      user: admin,
      data: { name, email: `${run}-${name}@example.invalid`, password, role, team: teamID },
    });
    staffIDs.push(user.id);
    return user;
  };
  const manager = await staff("manager", "manager"),
    op = await staff("op", "operations"),
    outsider = await staff("outside", "manager", foreign.id);
  const row = await p.create({
    collection: "providers",
    user: admin,
    data: {
      reference: run,
      organisation: "虚构HTTP机构",
      name: "虚构",
      email: "fake@example.invalid",
      city: "Shanghai",
      languages: "English",
      phone: "000",
      capabilities: "演示",
      categories: ["business"],
      requestKey: randomUUID(),
      contentHash: run,
      status: "applied",
      team: team.id,
      owner: op.id,
    },
  });
  providerID = row.id;
  const login = async (email: string) => {
    const r = await fetch(base + "/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return "JWT " + (await r.json()).token;
  };
  const token = await login(manager.email),
    operator = await login(op.email),
    outside = await login(outsider.email);
  const c = {
    id: row.id,
    status: "verified",
    reason: "虚构HTTP核实",
    key: randomUUID(),
    updatedAt: row.updatedAt,
  };
  const post = (input: unknown, auth = token, origin = base) =>
    fetch(base + "/api/provider-review", {
      method: "POST",
      headers: { Authorization: auth, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  assert.equal((await post(c, "")).status, 403);
  assert.equal((await post(c, operator)).status, 403);
  assert.equal((await post(c, outside)).status, 403);
  assert.equal((await post(c, token, "https://example.invalid")).status, 403);
  assert.equal((await post({ ...c, reason: " " })).status, 400);
  assert.equal((await post({ ...c, id: true })).status, 400);
  assert.equal((await post({ ...c, id: 2147483647 })).status, 403);
  assert.equal((await post({ ...c, reason: "a".repeat(13000) })).status, 413);
  const response = await post(c);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.status, "verified");
  assert.equal(result.publicApproved, false);
  assert.deepEqual(Object.keys(result).sort(), [
    "duplicate",
    "publicApproved",
    "status",
    "updatedAt",
  ]);
  assert.equal((await (await post(c)).json()).duplicate, true);
  assert.equal((await post({ ...c, reason: "不同原因" })).status, 409);
  assert.equal((await post({ ...c, key: randomUUID(), status: "paused" })).status, 409);
  const other = await p.update({
    collection: "providers",
    id: row.id,
    user: admin,
    data: { name: "虚构：他人已修改" },
  });
  const staleSave = await fetch(base + `/api/providers/${row.id}`, {
    method: "PATCH",
    headers: { Authorization: token, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "不得覆盖", editBase: result.updatedAt }),
  });
  assert.equal(staleSave.status, 409);
  const bypass = await fetch(base + `/api/providers/${row.id}`, {
    method: "PATCH",
    headers: { Authorization: token, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "contracted",
      publicApproved: true,
      editBase: other.updatedAt,
      context: { providerReview: "forged" },
    }),
  });
  assert.equal(bypass.status, 200);
  const saved = await p.findByID({ collection: "providers", id: row.id });
  assert.equal(saved.status, "verified");
  assert.equal(saved.publicApproved, false);
  assert.equal(saved.name, "虚构：他人已修改");
  await p.update({ collection: "staff", id: manager.id, user: admin, data: { active: false } });
  assert.equal((await post({ ...c, updatedAt: saved.updatedAt, key: randomUUID() })).status, 403);
  console.log(
    "PASS review HTTP auth/Origin/current role/scope/reasons/retry/stale/limits/readonly bypass and no-store projection",
  );
} finally {
  if (providerID) await p.delete({ collection: "providers", id: providerID });
  for (const id of staffIDs.reverse()) await p.delete({ collection: "staff", id });
  for (const id of teamIDs) await p.delete({ collection: "teams", id });
  await p.destroy();
}
process.exit(0);
