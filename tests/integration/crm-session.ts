import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { transactionSession } from "../../src/server/db-types";
import { crmAction } from "../../src/server/crm/service";
assertCrmTarget(process.env.DATABASE_URL ?? "");
const auth = await import("../../src/server/crm/access");
assert.ok("authenticateCrm" in auth, "CRM HTTP identities need native session verification");
const { getPayload } = await import("payload");
const p = await getPayload({ config: (await import("../../src/payload.config")).default });
const pool = (p.db as unknown as PostgresAdapter).pool;
try {
  const password = randomUUID(),
    email = `${randomUUID()}@example.invalid`;
  const admin = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Session fixture",
      email,
      password,
      role: "admin",
      active: true,
    },
  });
  const team = await p.create({ collection: "teams", data: { name: "Session team" } });
  const login = await p.login({ collection: "staff", data: { email, password } });
  const headers = new Headers({ authorization: `JWT ${login.token}` });
  const user = await auth.authenticateCrm(p, headers);
  const block = await p.db.beginTransaction();
  assert.ok(block);
  await transactionSession(p, block).db.execute("SELECT pg_advisory_xact_lock(726281)");
  const write = crmAction(p, user, {
    action: "createClient",
    operationKey: randomUUID(),
    kind: "company",
    displayName: "Revoked waiting request",
    language: "en",
    teamID: team.id,
  });
  const failure = assert.rejects(write, { status: 401 });
  const until = Date.now() + 10000;
  while (
    !(
      await pool.query(
        "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=726281 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
      )
    ).rowCount
  ) {
    assert.ok(Date.now() < until);
    await new Promise((r) => setTimeout(r, 10));
  }
  await p.update({
    collection: "staff",
    id: admin.id,
    data: { sessions: [] },
    req: {
      user: { ...admin, collection: "staff" },
      transactionID: block,
    },
  });
  await p.db.commitTransaction(block);
  const before = await databaseFingerprints(pool);
  await failure;
  assert.deepEqual(await databaseFingerprints(pool), before);
  await assert.rejects(() => auth.authenticateCrm(p, new Headers()), { status: 401 });
  console.log("PASS CRM native session: actual JWT, lock wait, session revocation, zero writes");
} finally {
  await p.destroy();
}
process.exit(0);
