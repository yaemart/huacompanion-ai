import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
const url = new URL(process.env.DATABASE_URL || ""),
  base = process.env.APP_URL || "";
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_intake_case_e3_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const p = await getPayload({ config }),
  run = `e3http-${randomUUID()}`,
  password = randomUUID(),
  staffIDs: number[] = [];
let teamID: number | undefined, inquiryID: number | undefined, caseID: number | undefined;
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password, role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({ collection: "teams", user: admin, data: { name: run } });
  teamID = team.id;
  const staff = async (name: string) => {
    const s = await p.create({
      collection: "staff",
      user: admin,
      data: {
        name,
        email: `${run}-${name}@example.invalid`,
        password,
        role: "operations",
        team: team.id,
      },
    });
    staffIDs.push(s.id);
    return s;
  };
  const op = await staff("op"),
    other = await staff("other");
  const q = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: run,
      name: "虚构HTTP客户",
      email: "fake@example.invalid",
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: op.id,
      requestKey: randomUUID(),
      contentHash: run,
    },
  });
  inquiryID = q.id;
  const login = async (email: string) => {
    const r = await fetch(base + "/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return "JWT " + (await r.json()).token;
  };
  const token = await login(op.email),
    outside = await login(other.email);
  const get = (suffix: string, auth = token) =>
    fetch(base + "/api/business" + suffix, { headers: { Authorization: auth } });
  const post = (input: unknown, auth = token, origin = base) =>
    fetch(base + "/api/business", {
      method: "POST",
      headers: { Authorization: auth, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  assert.equal((await get(`?inquiry=${q.id}`, "")).status, 403);
  assert.equal((await get(`?inquiry=${q.id}`, outside)).status, 403);
  assert.equal((await get("?inquiry=2147483647")).status, 403);
  for (const v of ["true", "0", "-1", "1e2", "9007199254740992"])
    assert.equal((await get("?inquiry=" + v)).status, 400);
  const before = await get(`?inquiry=${q.id}`);
  assert.equal(before.status, 200);
  assert.equal(before.headers.get("cache-control"), "no-store");
  assert.deepEqual(await before.json(), { case: null });
  const command = { action: "create", inquiry: q.id, title: "虚构HTTP服务单", key: randomUUID() };
  assert.equal((await post(command, token, "https://example.invalid")).status, 403);
  assert.equal((await post(command, "")).status, 403);
  assert.notEqual((await post(command, outside)).status, 200);
  const first = await post(command);
  assert.equal(first.status, 200);
  caseID = (await first.json()).case;
  assert.ok(caseID);
  assert.deepEqual(await (await get(`?inquiry=${q.id}`)).json(), { case: caseID });
  const repeat = await post(command);
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).case, caseID);
  await p.create({
    collection: "service-quotes",
    user: admin,
    data: {
      serviceCase: caseID!,
      dedupe: randomUUID(),
      revision: 1,
      status: "draft",
      title: "虚构报价",
      scope: "仅测试",
      included: "虚构",
      excluded: "虚构",
      terms: "虚构",
      currency: "CNY",
      lines: [{ label: "虚构", quantity: 1, unitMinor: 100 }],
      totalMinor: 100,
      internalCostMinor: 9381829,
      expiresAt: "2030-01-01T00:00:00.000Z",
      createdBy: admin.id,
    },
  });
  const detail = await get(`?id=${caseID}`);
  assert.equal(detail.status, 200);
  const json = await detail.json();
  assert.equal(json.case.id, caseID);
  assert.equal(json.inquiry.id, q.id);
  assert.equal(json.canCost, false);
  assert.ok(!JSON.stringify(json).includes("9381829"));
  assert.equal(json.quotes[0].internalCostMinor, undefined);
  assert.notEqual((await get(`?id=${caseID}`, outside)).status, 200);
  const page = await fetch(base + `/business-center?id=${caseID}`, {
    headers: { Authorization: token },
  });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("initialCaseID"));
  await p.update({ collection: "staff", id: op.id, user: admin, data: { active: false } });
  assert.equal((await get(`?inquiry=${q.id}`)).status, 403);
  assert.equal((await post({ ...command, key: randomUUID() })).status, 403);
  console.log(
    "PASS E3 production HTTP scoped lookup/create/retry, Origin/no-store, exact case, no operator costs and inactive JWT denial",
  );
} finally {
  if (caseID) {
    for (const collection of ["service-events", "service-quotes"] as const)
      await p.delete({ collection, where: { serviceCase: { equals: caseID } } });
    await p.delete({ collection: "service-cases", id: caseID });
  }
  if (inquiryID) await p.delete({ collection: "inquiries", id: inquiryID });
  for (const id of staffIDs.reverse()) await p.delete({ collection: "staff", id });
  if (teamID) await p.delete({ collection: "teams", id: teamID });
  await p.destroy();
}
process.exit(0);
