import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
const url = new URL(process.env.DATABASE_URL || ""),
  base = process.env.APP_URL || "";
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_followups_e2_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const p = await getPayload({ config }),
  run = `e2http-${randomUUID()}`,
  password = randomUUID();
const ids: number[] = [];
let teamID: number | undefined;
let inquiryID: number | undefined;
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}-admin@example.invalid`, password, role: "admin" },
  });
  ids.push(admin.id);
  const team = await p.create({
    collection: "teams",
    user: admin,
    overrideAccess: false,
    data: { name: run },
  });
  teamID = team.id;
  const staff = async (name: string) => {
    const s = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: {
        name,
        email: `${run}-${name}@example.invalid`,
        password,
        role: "operations",
        team: team.id,
      },
    });
    ids.push(s.id);
    return s;
  };
  const op = await staff("op"),
    other = await staff("other");
  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    overrideAccess: true,
    data: {
      reference: run,
      requestKey: randomUUID(),
      contentHash: run,
      name: "虚构HTTP客户",
      email: "fake@example.invalid",
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: op.id,
      notes: "HTTP旧备注",
    },
  });
  inquiryID = inquiry.id;
  const login = async (email: string) => {
    const r = await fetch(base + "/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return "JWT " + (await r.json()).token;
  };
  const auth = await login(op.email),
    outside = await login(other.email);
  const command = {
    kind: "inquiries",
    id: inquiry.id,
    body: "HTTP追加 <script>虚构</script>",
    key: randomUUID(),
  };
  const post = (body: unknown, token = auth, origin = base) =>
    fetch(base + "/api/intake-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Authorization: token },
      body: JSON.stringify(body),
    });
  assert.equal((await post(command, "")).status, 403);
  assert.equal((await post(command, outside)).status, 403);
  assert.equal((await post(command, auth, "https://example.invalid")).status, 403);
  assert.equal((await post({ ...command, actor: "伪造" })).status, 400);
  assert.equal((await post({ ...command, body: "x".repeat(60000) })).status, 413);
  const first = await post(command);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const result = await first.json();
  assert.deepEqual(Object.keys(result), ["followUps"]);
  assert.equal(result.followUps.length, 2);
  assert.equal(result.followUps[1].actor, String(op.id));
  assert.deepEqual(await (await post(command)).json(), result);
  assert.equal((await post({ ...command, body: "不同正文" })).status, 409);
  assert.notEqual((await fetch(base + `/api/inquiries/${inquiry.id}`)).status, 200);
  await p.update({
    collection: "staff",
    id: op.id,
    user: admin,
    overrideAccess: false,
    data: { active: false },
  });
  assert.equal((await post({ ...command, key: randomUUID() })).status, 403);
  console.log(
    "PASS production HTTP staff auth, assigned scope, no anonymous reads, Origin, size, metadata rejection, no-store, saved history, retry/conflict and inactive JWT denial",
  );
} finally {
  if (inquiryID) await p.delete({ collection: "inquiries", id: inquiryID, overrideAccess: true });
  for (const id of ids.reverse()) await p.delete({ collection: "staff", id, overrideAccess: true });
  if (teamID) await p.delete({ collection: "teams", id: teamID, overrideAccess: true });
  await p.destroy();
}
process.exit(0);
