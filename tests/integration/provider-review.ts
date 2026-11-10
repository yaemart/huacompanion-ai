import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { reviewProvider } from "../../src/server/provider-review";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_provider_review_e5_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config }),
  run = `e5-${randomUUID()}`,
  password = randomUUID();
const staffIDs: number[] = [],
  teamIDs: number[] = [];
let providerID: number | undefined;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
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
  const staff = async (
    name: string,
    role: "manager" | "operations" | "reviewer",
    teamID = team.id,
  ) => {
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
    reviewer = await staff("reviewer", "reviewer"),
    outsider = await staff("outside", "manager", foreign.id),
    foreignOp = await staff("foreignOp", "operations", foreign.id);
  const provider = await p.create({
    collection: "providers",
    user: admin,
    data: {
      reference: run,
      organisation: "虚构审核机构",
      name: "虚构联系人",
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
  providerID = provider.id;
  const read = () => p.findByID({ collection: "providers", id: provider.id, depth: 0 });
  const command = async (status = "verified") => ({
    id: provider.id,
    status,
    reason: "虚构测试核实原因",
    key: randomUUID(),
    updatedAt: (await read()).updatedAt,
  });
  for (const user of [op, reviewer, outsider])
    await assert.rejects(() => command().then((c) => reviewProvider(p, user, c)), { status: 403 });
  await assert.rejects(
    () => command().then((c) => reviewProvider(p, manager, { ...c, reason: " " })),
    { status: 400 },
  );
  await assert.rejects(
    () => command().then((c) => reviewProvider(p, manager, { ...c, id: 2147483647 })),
    { status: 403 },
  );
  const c = await command();
  const results = await Promise.all([reviewProvider(p, manager, c), reviewProvider(p, manager, c)]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  assert.equal((await read()).status, "verified");
  assert.equal((await read()).publicApproved, false);
  const audit = await p.find({
    collection: "audit-events",
    where: { action: { equals: `provider-review:${c.key}` } },
  });
  assert.equal(audit.totalDocs, 1);
  assert.equal(
    String(
      audit.docs[0].actor && typeof audit.docs[0].actor === "object"
        ? audit.docs[0].actor.id
        : audit.docs[0].actor,
    ),
    String(manager.id),
  );
  assert.equal((audit.docs[0].after as { reason: string }).reason, c.reason);
  await assert.rejects(() => reviewProvider(p, manager, { ...c, reason: "不同原因" }), {
    status: 409,
  });
  await assert.rejects(
    () =>
      command("paused").then((d) => reviewProvider(p, manager, { ...d, updatedAt: c.updatedAt })),
    { status: 409 },
  );
  await p.update({
    collection: "providers",
    id: provider.id,
    user: admin,
    data: { publicApproved: true },
  });
  await assert.rejects(
    () =>
      p.update({
        collection: "providers",
        id: provider.id,
        user: manager,
        overrideAccess: false,
        data: { name: "旧页面不应覆盖", editBase: c.updatedAt } as Record<string, unknown>,
      }),
    { status: 409 },
  );
  assert.equal((await read()).name, "虚构联系人");
  await assert.rejects(() => reviewProvider(p, manager, c), { status: 409 });
  await reviewProvider(p, manager, await command("paused"));
  assert.equal((await read()).publicApproved, false);
  await reviewProvider(p, manager, await command("verified"));
  assert.equal((await read()).publicApproved, false);
  await reviewProvider(p, admin, await command("contracted"));
  await assert.rejects(() =>
    p.update({
      collection: "providers",
      id: provider.id,
      user: admin,
      data: { status: "paused" },
      context: { providerReview: "forged" },
    }),
  );
  await p.update({
    collection: "providers",
    id: provider.id,
    user: manager,
    overrideAccess: false,
    data: { status: "paused", publicApproved: true },
  });
  assert.equal((await read()).status, "contracted");
  assert.equal((await read()).publicApproved, false);
  const fail = await command("paused");
  await db.query(
    "CREATE FUNCTION e5_reject_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'provider-review:%' THEN RAISE EXCEPTION 'e5 audit failure'; END IF; RETURN NEW; END; $$",
  );
  await db.query(
    "CREATE TRIGGER e5_reject_review BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION e5_reject_review()",
  );
  const before = await read();
  try {
    await assert.rejects(() => reviewProvider(p, manager, fail));
  } finally {
    await db.query("DROP TRIGGER e5_reject_review ON audit_events");
    await db.query("DROP FUNCTION e5_reject_review()");
  }
  assert.deepEqual(await read(), before);
  await p.update({ collection: "staff", id: manager.id, user: admin, data: { active: false } });
  await assert.rejects(() => command().then((d) => reviewProvider(p, manager, d)), { status: 403 });
  await p.update({
    collection: "staff",
    id: manager.id,
    user: admin,
    data: { active: true, team: foreign.id },
  });
  await assert.rejects(() => command().then((d) => reviewProvider(p, manager, d)), { status: 403 });
  await p.update({ collection: "staff", id: manager.id, user: admin, data: { team: team.id } });
  const queued = async (n: number) => {
    for (let i = 0; i < 200; i++) {
      const r = await db.query(
        "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
      );
      if (r.rows[0].n >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Expected queued catalog lock");
  };
  const stale = await command();
  await db.query("SELECT pg_advisory_lock(726271)");
  const moved = p.update({
    collection: "providers",
    id: provider.id,
    user: admin,
    data: { team: foreign.id, owner: foreignOp.id },
  });
  let denied: Promise<boolean> | undefined;
  try {
    await queued(1);
    denied = reviewProvider(p, manager, stale).then(
      () => false,
      () => true,
    );
    await queued(2);
  } finally {
    await db.query("SELECT pg_advisory_unlock(726271)");
  }
  await moved;
  assert.equal(await denied, true);
  const columns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='providers' AND column_name='edit_base'",
  );
  assert.equal(columns.rows.length, 0);
  console.log(
    "PASS scoped/current-authority reviews, reason/audit, retry/concurrency, stale rejection, pause no republish, bypass denial, rollback and queued reassignment",
  );
} finally {
  await db.query("SELECT pg_advisory_unlock_all()");
  if (providerID) await p.delete({ collection: "providers", id: providerID });
  for (const id of staffIDs.reverse()) await p.delete({ collection: "staff", id });
  for (const id of teamIDs) await p.delete({ collection: "teams", id });
  await db.end();
  await p.destroy();
}
process.exit(0);
