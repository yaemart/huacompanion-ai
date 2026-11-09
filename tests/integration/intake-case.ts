import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  businessCaseForInquiry,
  businessAction,
  businessRead,
  businessTransaction,
} from "../../src/server/business/service";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_intake_case_e3_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config }),
  run = `e3-${randomUUID()}`,
  password = randomUUID();
const staffIDs: number[] = [],
  teamIDs: number[] = [],
  inquiries: number[] = [];
const db = new pg.Pool({ connectionString: url.toString(), max: 1 });
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password, role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({ collection: "teams", data: { name: run }, user: admin });
  const foreign = await p.create({
    collection: "teams",
    data: { name: run + "foreign" },
    user: admin,
  });
  teamIDs.push(team.id, foreign.id);
  const makeStaff = async (
    role: "operations" | "manager" | "reviewer",
    name: string,
    teamID = team.id,
  ) => {
    const s = await p.create({
      collection: "staff",
      user: admin,
      data: { name, email: `${run}-${name}@example.invalid`, password, role, team: teamID },
    });
    staffIDs.push(s.id);
    return s;
  };
  const op = await makeStaff("operations", "op"),
    other = await makeStaff("operations", "other"),
    manager = await makeStaff("manager", "manager"),
    outsider = await makeStaff("manager", "outsider", foreign.id),
    reviewer = await makeStaff("reviewer", "reviewer");
  const q = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      reference: run,
      name: "虚构E3",
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
  inquiries.push(q.id);
  assert.deepEqual(await businessCaseForInquiry(p, op, q.id), { case: null });
  await assert.rejects(() => businessCaseForInquiry(p, other, q.id), { status: 403 });
  await assert.rejects(() => businessCaseForInquiry(p, op, 2147483647), { status: 403 });
  for (const u of [other, outsider, reviewer])
    await assert.rejects(() => businessCaseForInquiry(p, u, q.id));
  for (const id of [true, 0, -1, "1e2", [q.id], "9007199254740992"])
    await assert.rejects(() => businessCaseForInquiry(p, op, id));
  const command = { action: "create", inquiry: q.id, title: "虚构服务单", key: randomUUID() };
  const [a, b] = await Promise.all([
    businessAction(p, op, command),
    businessAction(p, manager, { ...command, key: randomUUID() }),
  ]);
  assert.equal(a.case, b.case);
  assert.deepEqual(await businessCaseForInquiry(p, op, q.id), { case: a.case });
  assert.deepEqual(await businessCaseForInquiry(p, manager, q.id), { case: a.case });
  assert.equal((await businessAction(p, op, command)).case, a.case);
  assert.equal(
    (await businessAction(p, op, { ...command, title: "不能覆盖", key: randomUUID() })).case,
    a.case,
  );
  assert.equal((await businessRead(p, op, a.case)).case.title, "虚构服务单");
  assert.equal(
    (await p.count({ collection: "service-cases", where: { inquiry: { equals: q.id } } }))
      .totalDocs,
    1,
  );
  const event = (
    await p.find({
      collection: "service-events",
      where: {
        and: [{ serviceCase: { equals: a.case } }, { action: { equals: "create" } }],
      },
    })
  ).docs[0];
  assert.equal(
    (
      await p.count({
        collection: "workflow-events",
        where: { key: { equals: `business:${event.id}` } },
      })
    ).totalDocs,
    1,
  );
  await businessTransaction(p, async (req) => {
    for (let i = 0; i < 200; i++) {
      const newer = await p.create({
        collection: "inquiries",
        user: admin,
        req,
        data: {
          reference: `${run}-${i}`,
          name: q.name,
          email: q.email,
          city: q.city,
          categories: q.categories,
          status: "new",
          team: team.id,
          owner: op.id,
          contentHash: run,
          requestKey: randomUUID(),
        },
      });
      inquiries.push(newer.id);
    }
  });
  assert.ok(!(await businessRead(p, op)).inquiries.some((r) => r.id === q.id));
  assert.deepEqual(await businessCaseForInquiry(p, op, q.id), { case: a.case });
  assert.equal(
    (
      await p.count({
        collection: "service-events",
        where: { and: [{ serviceCase: { equals: a.case } }, { action: { equals: "create" } }] },
      })
    ).totalDocs,
    1,
  );
  for (const u of [other, outsider, reviewer])
    await assert.rejects(() => businessAction(p, u, { ...command, key: randomUUID() }));
  await p.update({ collection: "staff", id: op.id, user: admin, data: { active: false } });
  await assert.rejects(() => businessCaseForInquiry(p, op, q.id));
  await p.update({
    collection: "staff",
    id: op.id,
    user: admin,
    data: { active: true, team: foreign.id },
  });
  await assert.rejects(() => businessCaseForInquiry(p, op, q.id));
  await p.update({ collection: "staff", id: op.id, user: admin, data: { team: team.id } });
  await db.query("SELECT pg_advisory_lock(726281)");
  const untilQueued = async (n: number) => {
    for (let i = 0; i < 150; i++) {
      const result = await db.query(
        "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
      );
      if (result.rows[0].n >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Expected queued business lock");
  };
  const moved = p.update({
    collection: "inquiries",
    id: q.id,
    user: admin,
    data: { owner: other.id },
  });
  let stale: Promise<boolean> | undefined;
  try {
    await untilQueued(1);
    stale = businessCaseForInquiry(p, op, q.id).then(
      () => true,
      () => false,
    );
    await untilQueued(2);
  } finally {
    await db.query("SELECT pg_advisory_unlock(726281)");
  }
  await moved;
  assert.equal(await stale, false);
  await assert.rejects(() => businessCaseForInquiry(p, op, q.id));
  assert.deepEqual(await businessCaseForInquiry(p, other, q.id), { case: a.case });
  const row = await p.findByID({ collection: "inquiries", id: q.id });
  assert.equal(row.status, "new");
  assert.equal(row.followUps, null);
  console.log(
    "PASS E3 scoped/current-authority lookup, single creation/event, duplicate/concurrent actions, no mutation of inquiry",
  );
} finally {
  for (const id of inquiries) {
    const cases = await p.find({
      collection: "service-cases",
      where: { inquiry: { equals: id } },
      pagination: false,
    });
    for (const c of cases.docs) {
      for (const slug of ["service-events", "service-quotes"] as const)
        await p.delete({ collection: slug, where: { serviceCase: { equals: c.id } } });
      await p.delete({ collection: "service-cases", id: c.id });
    }
    await p.delete({ collection: "inquiries", id });
  }
  for (const id of staffIDs.reverse()) await p.delete({ collection: "staff", id });
  for (const id of teamIDs) await p.delete({ collection: "teams", id });
  await p.destroy();
  await db.end();
}
process.exit(0);
