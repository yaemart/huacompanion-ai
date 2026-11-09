import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import pg from "pg";
import { getPayload } from "payload";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import config from "../../src/payload.config";
import { appendIntakeFollowup } from "../../src/server/intake-followups";
import { down } from "../../src/migrations/20261109_120000_intake_followups";
import { followUps } from "../../src/lib/intake-followups";
import { reportingExport } from "../../src/server/reporting/service";
import { saveIntake } from "../../src/server/intake";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_followups_e2_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const db = new pg.Pool({ connectionString: url.toString(), max: 1 });
const run = `e2-${randomUUID()}`,
  password = randomUUID();
const staffIDs: number[] = [],
  teamIDs: number[] = [],
  records: { collection: "inquiries" | "providers"; id: number }[] = [];
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password, role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({
    collection: "teams",
    user: admin,
    overrideAccess: false,
    data: { name: run },
  });
  teamIDs.push(team.id);
  const foreign = await p.create({
    collection: "teams",
    user: admin,
    overrideAccess: false,
    data: { name: `${run}-foreign` },
  });
  teamIDs.push(foreign.id);
  const staff = async (
    role: "operations" | "manager" | "reviewer",
    name: string,
    teamID = team.id,
  ) => {
    const s = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: { name, email: `${run}-${name}@example.invalid`, password, role, team: teamID },
    });
    staffIDs.push(s.id);
    return s;
  };
  const op = await staff("operations", "op"),
    manager = await staff("manager", "manager"),
    other = await staff("operations", "other"),
    outsider = await staff("manager", "outsider", foreign.id),
    reviewer = await staff("reviewer", "reviewer");
  for (const kind of ["inquiries", "providers"] as const) {
    const common = {
      reference: `${run}-${kind}`,
      name: run,
      email: "fake@example.invalid",
      city: run,
      categories: ["business" as const],
      requestKey: randomUUID(),
      contentHash: run,
      team: team.id,
      owner: op.id,
      notes: "  旧备注\n原文 <script>fake</script>  ",
    };
    const r =
      kind === "inquiries"
        ? await p.create({
            collection: kind,
            overrideAccess: true,
            user: admin,
            data: { ...common, status: "new" },
          })
        : await p.create({
            collection: kind,
            overrideAccess: true,
            user: admin,
            data: {
              ...common,
              status: "applied",
              organisation: "虚构服务商",
              phone: "000",
              languages: "en",
              capabilities: "虚构",
            },
          });
    records.push({ collection: kind, id: r.id });
    assert.deepEqual(followUps(r.followUps), [{ id: "legacy", body: common.notes, legacy: true }]);
    const command = { kind, id: r.id, body: "第一条虚构跟进", key: randomUUID() };
    for (const user of [other, outsider, reviewer, undefined])
      await assert.rejects(
        () => appendIntakeFollowup(p, user, command),
        (e: unknown) => (e as { status?: number }).status === 403,
      );
    for (const user of [op, manager, admin]) {
      const attempted = await p.update({
        collection: kind,
        id: r.id,
        user,
        overrideAccess: false,
        data: { notes: "覆盖旧备注", followUps: [] },
      });
      assert.equal(attempted.notes, common.notes);
      assert.deepEqual(followUps(attempted.followUps), [
        { id: "legacy", body: common.notes, legacy: true },
      ]);
    }
    await assert.rejects(
      p.update({ collection: kind, id: r.id, overrideAccess: true, data: { followUps: [] } }),
    );
    await assert.rejects(
      p.update({ collection: kind, id: r.id, overrideAccess: true, data: { notes: "覆盖" } }),
    );
    const auditCount = async () =>
      (
        await p.find({
          collection: "audit-events",
          overrideAccess: true,
          where: {
            and: [
              { entity: { equals: kind } },
              { recordId: { equals: String(r.id) } },
              { fields: { contains: "followUps" } },
            ],
          },
          limit: 1,
        })
      ).totalDocs;
    const count = await auditCount();
    const editTime = (await p.findByID({ collection: kind, id: r.id, depth: 0 })).updatedAt;
    const first = await appendIntakeFollowup(p, op, command);
    assert.equal(first.followUps.length, 2);
    assert.equal((await p.findByID({ collection: kind, id: r.id, depth: 0 })).updatedAt, editTime);
    assert.equal(first.followUps[1].actor, String(op.id));
    assert.equal(first.followUps[1].actorName, op.name);
    assert.ok(Math.abs(Date.parse(first.followUps[1].at!) - Date.now()) < 10000);
    const again = await appendIntakeFollowup(p, op, command);
    assert.deepEqual(again, first);
    assert.equal(await auditCount(), count + 1);
    await assert.rejects(() => appendIntakeFollowup(p, op, { ...command, body: "换文但同key" }));
    await assert.rejects(() =>
      appendIntakeFollowup(p, op, { ...command, key: randomUUID(), actor: "伪造" }),
    );
    await Promise.all([
      appendIntakeFollowup(p, op, { ...command, body: "并发甲", key: randomUUID() }),
      appendIntakeFollowup(p, manager, { ...command, body: "并发乙", key: randomUUID() }),
    ]);
    const saved = await p.findByID({
      collection: kind,
      id: r.id,
      overrideAccess: false,
      user: op,
      depth: 0,
    });
    assert.equal(followUps(saved.followUps).length, 4);
    assert.equal(saved.notes, common.notes);
    await p.update({
      collection: kind,
      id: r.id,
      user: op,
      overrideAccess: false,
      data: { name: "其他修改" },
    });
    assert.equal(
      followUps((await p.findByID({ collection: kind, id: r.id, overrideAccess: true })).followUps)
        .length,
      4,
    );
    const duplicated = { ...command, body: "并发重试", key: randomUUID() };
    const pair = await Promise.all([
      appendIntakeFollowup(p, op, duplicated),
      appendIntakeFollowup(p, op, duplicated),
    ]);
    assert.equal(pair[0].followUps.length, 5);
    assert.equal(pair[1].followUps.length, 5);
    await Promise.all([
      p.update({
        collection: kind,
        id: r.id,
        overrideAccess: false,
        user: op,
        data: { name: "并发资料保存" },
      }),
      appendIntakeFollowup(p, op, { ...command, body: "与资料并发跟进", key: randomUUID() }),
    ]);
    assert.equal(
      followUps((await p.findByID({ collection: kind, id: r.id, depth: 0 })).followUps).length,
      6,
    );
    await db.query("SELECT pg_advisory_lock(726281)");
    const untilQueued = async (n: number) => {
      for (let i = 0; i < 100; i++) {
        const q = await db.query(
          "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
        );
        if (q.rows[0].n >= n) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw Error("Expected queued business lock");
    };
    const reassigned = p.update({
      collection: kind,
      id: r.id,
      overrideAccess: false,
      user: admin,
      data: { owner: other.id },
    });
    let stale: Promise<boolean> | undefined;
    try {
      await untilQueued(1);
      stale = p
        .update({
          collection: kind,
          id: r.id,
          overrideAccess: false,
          user: op,
          data: { name: "必须拒绝的过期编辑" },
        })
        .then(
          () => true,
          () => false,
        );
      await untilQueued(2);
    } finally {
      await db.query("SELECT pg_advisory_unlock(726281)");
    }
    await reassigned;
    assert.equal(
      await stale,
      false,
      "queued editor must not write/read new history after reassignment",
    );
    await p.update({
      collection: kind,
      id: r.id,
      overrideAccess: false,
      user: admin,
      data: { owner: op.id },
    });
    const beforeFailure = (await p.findByID({ collection: kind, id: r.id, depth: 0 })).followUps;
    await db.query(
      `CREATE FUNCTION e2_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN IF NEW.fields LIKE '%followUps%' THEN RAISE EXCEPTION 'E2 test audit failure'; END IF; RETURN NEW; END $$;
       CREATE TRIGGER e2_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION e2_reject_audit()`,
    );
    try {
      await assert.rejects(() =>
        appendIntakeFollowup(p, op, { ...command, body: "必须回滚", key: randomUUID() }),
      );
    } finally {
      await db.query(
        "DROP TRIGGER e2_reject_audit ON audit_events; DROP FUNCTION e2_reject_audit()",
      );
    }
    assert.deepEqual(
      (await p.findByID({ collection: kind, id: r.id, depth: 0 })).followUps,
      beforeFailure,
    );
    await p.update({
      collection: "staff",
      id: op.id,
      user: admin,
      overrideAccess: false,
      data: { team: foreign.id },
    });
    await assert.rejects(() => appendIntakeFollowup(p, op, { ...command, key: randomUUID() }));
    await p.update({
      collection: "staff",
      id: op.id,
      user: admin,
      overrideAccess: false,
      data: { team: team.id },
    });
    const exported = await reportingExport(p, admin, {
      entity: kind,
      filters: {},
      includeSensitive: true,
    });
    assert.ok(exported.csv.includes("并发甲"));
    await assert.rejects(() =>
      reportingExport(p, op, { entity: kind, filters: {}, includeSensitive: true }),
    );
    await assert.rejects(() =>
      down({ db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateDownArgs),
    );
    await p.update({
      collection: "staff",
      id: op.id,
      user: admin,
      overrideAccess: false,
      data: { active: false },
    });
    await assert.rejects(() => appendIntakeFollowup(p, op, { ...command, key: randomUUID() }));
    await p.update({
      collection: "staff",
      id: op.id,
      user: admin,
      overrideAccess: false,
      data: { active: true },
    });
  }
  // Execute the actual Compose inquiry fixture block against this guarded clone.
  // The Compose entry-point environment guard remains unchanged.
  const source = readFileSync("scripts/smoke-compose.ts", "utf8");
  const begin = source.indexOf("  for (const operator of operators) {");
  const end = source.indexOf("  const provider =", begin);
  assert.ok(begin > 0 && end > begin);
  const inquiries: { id: number }[] = [];
  await runInNewContext(`(async () => {${source.slice(begin, end)}})()`, {
    p,
    admin,
    operators: [op],
    inquiries,
    appendIntakeFollowup,
    randomUUID,
    common: {
      categories: ["transport"],
      city: "Shanghai",
      people: "2",
      datesUnknown: true,
      name: "Fictional compose regression",
      email: `${run}-compose@example.invalid`,
      language: "English",
      consent: true,
    },
    saveIntake: async (input: unknown, key: string) => {
      const receipt = await saveIntake(input, key);
      const r = (
        await p.find({
          collection: "inquiries",
          where: { reference: { equals: receipt.reference } },
        })
      ).docs[0];
      records.push({ collection: "inquiries", id: r.id });
      return receipt;
    },
  });
  const fixture = await p.findByID({ collection: "inquiries", id: inquiries[0].id });
  assert.equal(followUps(fixture.followUps)[0].body, "COMPOSE_INTERNAL_NOTE");
  const ordinaryCSV = await reportingExport(p, op, {
    entity: "inquiries",
    filters: {},
    includeSensitive: false,
  });
  assert.ok(!ordinaryCSV.csv.includes("COMPOSE_INTERNAL_NOTE"));
  assert.ok(
    (
      await reportingExport(p, admin, {
        entity: "inquiries",
        filters: {},
        includeSensitive: true,
      })
    ).csv.includes("COMPOSE_INTERNAL_NOTE"),
  );
  console.log(
    "PASS E2 immutable legacy history, current scope, retries, concurrency, audit rollback, independent timestamp and safe export",
  );
} finally {
  for (const r of records) await p.delete({ ...r, overrideAccess: true });
  for (const id of staffIDs.reverse())
    await p.delete({ collection: "staff", id, overrideAccess: true });
  for (const id of teamIDs) await p.delete({ collection: "teams", id, overrideAccess: true });
  await p.destroy();
  await db.end();
}
process.exit(0);
