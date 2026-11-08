import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { protectedDemoData } from "../helpers/policy-demo-preservation";
import { cleanupPolicyDemo, readCleanupScope } from "../../scripts/lib/policy-demo-cleanup";
const state = JSON.parse(fs.readFileSync(".local/policy-c6/state.json", "utf8"));
const url = new URL(state.databaseURL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55442" ||
  !/^\/hua_policy_c6_[a-f0-9]{32}$/.test(url.pathname)
)
  throw Error("Disposable C6 clone only");
const c = new pg.Client({ connectionString: state.databaseURL });
await c.connect();
try {
  const approved = await readCleanupScope(c);
  const protectedBefore = await protectedDemoData(c, approved);
  await assert.rejects(() => cleanupPolicyDemo(c, approved, 99999), /管理员/);
  await c.query("UPDATE imm_policies SET public_notes=public_notes||' changed' WHERE id=1");
  await assert.rejects(() => cleanupPolicyDemo(c, approved, 1), /清单|变化/);
  await c.query("UPDATE imm_policies SET public_notes=$1 WHERE id=1", [
    approved.rows.imm_policies[0].public_notes,
  ]);
  await c.query(
    "INSERT INTO content_events(draft_id,revision,action,actor,snapshot) SELECT 18,1,'publish',1,snapshot FROM content_events WHERE id=17",
  );
  await assert.rejects(() => cleanupPolicyDemo(c, approved, 1), /清单|关联|变化/);
  await c.query("DELETE FROM content_events WHERE draft_id=18 AND id<>17");
  const before = (await c.query("SELECT count(*)::int n FROM imm_policies")).rows[0].n;
  const query = c.query.bind(c);
  c.query = async function (...args: Parameters<typeof query>) {
    if (typeof args[0] === "string" && args[0].startsWith("INSERT INTO audit_events"))
      throw Error("forced audit failure");
    return query(...args);
  } as typeof c.query;
  await assert.rejects(() => cleanupPolicyDemo(c, approved, 1), /forced audit failure/);
  c.query = query;
  assert.equal((await c.query("SELECT count(*)::int n FROM imm_policies")).rows[0].n, before);
  assert.equal(await cleanupPolicyDemo(c, approved, 1), "cleaned");
  assert.equal(await cleanupPolicyDemo(c, approved, 1), "already-cleaned");
  assert.deepEqual(await protectedDemoData(c, approved, protectedBefore), protectedBefore);
  assert.equal((await c.query("SELECT count(*)::int n FROM imm_policies")).rows[0].n, 0);
  assert.equal((await c.query("SELECT count(*)::int n FROM content_drafts")).rows[0].n, 34);
  assert.equal((await c.query("SELECT count(*)::int n FROM content_published")).rows[0].n, 32);
  console.log(
    "PASS cleanup scope drift/extra association/admin denial, audit failure rollback, exact deletion and idempotency",
  );
} finally {
  await c.end();
}
