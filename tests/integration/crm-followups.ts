import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { up, down } from "../../src/migrations/20261128_170000_crm_followups";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const config = (await import("../../src/payload.config")).default;
const p = await getPayload({ config });
const pool = (p.db as unknown as PostgresAdapter).pool;
const key = () => randomUUID();
let checks = 0;
const pass = (s: string) => console.log(`PASS C1 ${++checks}: ${s}`);
async function migration(fn: typeof up, rollback = false) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await fn({ db: { execute: (s: string) => db.query(s) } } as unknown as Parameters<
      typeof up
    >[0]);
    await db.query(rollback ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
try {
  const before = await databaseFingerprints(pool);
  await migration(down);
  await migration(up);
  assert.deepEqual(await databaseFingerprints(pool, before), before);
  pass("empty migration down/up preserves existing tables");
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "C1 admin",
      email: "c1-admin@example.invalid",
      password: key(),
      role: "admin",
      active: true,
    },
  });
  const user = { ...admin, collection: "staff" as const };
  const team = await p.create({ collection: "teams", data: { name: "C1 team" } });
  const client = await p.create({
    collection: "crm-clients",
    data: {
      reference: key(),
      kind: "company",
      displayName: "Fictional C1",
      language: "zh",
      team: team.id,
      status: "active",
      revision: 1,
    },
  });
  const task = await p.create({
    collection: "crm-followups",
    data: {
      reference: key(),
      anchorKind: "client",
      client: client.id,
      type: "adhoc",
      title: "Call",
      description: "",
      dueAt: "2026-11-28T01:00:00Z",
      state: "pending",
      revision: 1,
      needsReview: false,
      createdBy: admin.id,
    },
  });
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET client_id=NULL WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET revision=1.5 WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET due_at='infinity' WHERE id=$1", [task.id]),
  );
  await assert.rejects(() =>
    pool.query("UPDATE crm_followups SET state='completed' WHERE id=$1", [task.id]),
  );
  await p.create({
    collection: "crm-followup-events",
    data: {
      task: task.id,
      seq: 1,
      action: "created",
      actor: admin.id,
      serverTime: new Date().toISOString(),
      details: { revision: 1 },
    },
  });
  await assert.rejects(() =>
    p.create({
      collection: "crm-followup-events",
      data: {
        task: task.id,
        seq: 1,
        action: "created",
        actor: admin.id,
        serverTime: new Date().toISOString(),
        details: {},
      },
    }),
  );
  await assert.rejects(() => migration(down));
  await assert.rejects(() => p.delete({ collection: "crm-clients", id: client.id }));
  await assert.rejects(
    () => p.find({ collection: "crm-followups", overrideAccess: false, user, depth: 0 }),
    { status: 403 },
  );
  pass("database constraints and private access preserve history");
} finally {
  await p.destroy();
}

process.exit(0);
