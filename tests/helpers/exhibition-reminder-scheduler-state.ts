import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { Payload } from "payload";
import { applyExhibitionReminders } from "../../src/server/exhibition-reminders";
import { recoveryFixture, assertRecoveryDatabase } from "./exhibition-reminder-recovery-fixture";

export async function testExhibitionSchedulerReadBoundary(p: Payload) {
  assertRecoveryDatabase();
  const api = await import("../../src/server/exhibition-reminder-scheduler-state").catch(
    () => null,
  );
  assert.ok(api?.readExhibitionSchedulerStatus, "readonly scheduler database status must exist");
  const status = api.readExhibitionSchedulerStatus,
    f = await recoveryFixture(p);
  const files = mkdtempSync(join(tmpdir(), "hua scheduler read-")),
    marker = join(files, "network");
  const tokenFile = (name: string, token: string) => {
    const path = join(files, name);
    writeFileSync(path, token, { mode: 0o600 });
    return path;
  };
  const auth = tokenFile("admin.jwt", f.admin.headers.get("authorization")!.slice(4));
  const other = tokenFile("other.jwt", f.other.headers.get("authorization")!.slice(4));
  const manager = tokenFile("manager.jwt", f.manager.headers.get("authorization")!.slice(4));
  const receipt = tokenFile("input.receipt", f.receipt);
  const types = resolve("payload-types.ts"),
    typesBefore = readFileSync(types),
    typesTime = statSync(types).mtimeMs;
  let probe = false;
  const cli = async (args: string[], authFile = auth, env: Record<string, string> = {}) => {
    let result: ReturnType<typeof spawnSync>;
    const inputBefore = readFileSync(receipt);
    await f.unchanged(async () => {
      result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          pathToFileURL(resolve("tests/helpers/exhibition-reminder-command-session.ts")).href,
          "scripts/exhibition-reminders.ts",
          ...args,
          "--auth-file",
          authFile,
        ],
        {
          env: {
            ...process.env,
            HUA_REMINDER_COMMAND_NETWORK_PROBE: marker,
            DOTENV_CONFIG_PATH: "/dev/null",
            HUA_DEMO_SCHEMA_PUSH: "true",
            ...env,
          },
          encoding: "utf8",
          timeout: 20000,
        },
      );
    });
    assert.deepEqual(readFileSync(receipt), inputBefore);
    const r = result!,
      text = String(r.stdout) + String(r.stderr);
    for (const value of [
      f.receipt,
      readFileSync(authFile, "utf8"),
      process.env.PAYLOAD_SECRET!,
      new URL(process.env.DATABASE_URL!).password,
    ])
      if (value) assert.equal(text.includes(value), false, "private command output");
    assert.doesNotMatch(text, /Error:|recipientHash|example.invalid|owner|runId/);
    assert.equal(r.error, undefined);
    return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) };
  };
  const controls: number[] = [];
  const add = async (action: string, recordId: string, after: Record<string, unknown>) => {
    const row = await p.create({
      collection: "audit-events",
      data: {
        entity: "exhibition-reminder-scheduler",
        action,
        recordId,
        actor: f.admin.user.id,
        after,
      },
    });
    controls.push(row.id);
    f.audits.push(row.id);
    return row.id;
  };
  const idle = { version: 1, runId: null, owner: null, targets: [], pending: null };
  const active = {
    version: 1,
    runId: "47a193aa-3795-4b72-8135-96dd4ef83988",
    owner: f.admin.user.id,
    targets: [f.scope],
    pending: null,
  };
  try {
    await f.unchanged(async () => {
      assert.deepEqual(await status(p, f.admin.headers), { status: "unregistered", revision: 0 });
      await assert.rejects(status(p, f.manager.headers), { status: 403 });
      await assert.rejects(status(p, new Headers()), { status: 403 });
    });
    const unregistered = await cli(["scheduler-status"]);
    assert.equal(unregistered.status, 0, unregistered.stderr);
    assert.match(unregistered.stdout, /未登记.*尚未启用/);
    const notFound = await cli(["inspect", "--receipt-file", receipt]);
    assert.equal(notFound.status, 0, notFound.stderr);
    assert.match(notFound.stdout, /未找到可确认提交.*当前资格未检查/);
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { scope: { equals: JSON.stringify([f.scope.key, "zh"]) } },
        })
      ).totalDocs,
      0,
    );
    await applyExhibitionReminders(p, f.admin.headers, f.receipt);
    const history = await cli(["inspect", "--receipt-file", receipt]);
    assert.equal(history.status, 0, history.stderr);
    assert.match(history.stdout, /历史操作结果.*当前资格未检查/);
    assert.match(history.stdout, /当时新增：1/);
    assert.equal((await cli(["inspect", "--receipt-file", receipt], other)).status, 1);
    assert.equal((await cli(["scheduler-status"], manager)).status, 1);
    const idleId = await add("state-v1", "global", idle);
    await f.unchanged(async () =>
      assert.deepEqual(await status(p, f.other.headers), { status: "idle", revision: idleId }),
    );
    const runningId = await add("state-v1", "global", active);
    assert.deepEqual(await status(p, f.admin.headers), { status: "running", revision: runningId });
    const digest = "a".repeat(64);
    const blockedId = await add("state-v1", "global", {
      ...active,
      pending: { digest, scope: f.scope },
    });
    await f.unchanged(async () => {
      assert.deepEqual(await status(p, f.admin.headers), {
        status: "blocked",
        revision: blockedId,
        scope: f.scope,
      });
      assert.deepEqual(await status(p, f.other.headers), {
        status: "blocked",
        revision: blockedId,
        scope: f.scope,
      });
    });
    const blocked = await cli(["scheduler-status"]);
    assert.equal(blocked.status, 0, blocked.stderr);
    assert.match(blocked.stdout, /存在未决/);
    assert.equal(blocked.stdout.includes(digest), false);
    assert.equal(blocked.stdout.includes(active.runId), false);
    assert.match(blocked.stdout, new RegExp("状态版本：" + blockedId));
    // A second working directory has no state files; the same DB still decides blocked.
    const empty = join(files, "empty");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(empty);
    const relocatedAuth = join(empty, "same-admin.jwt");
    writeFileSync(relocatedAuth, readFileSync(auth), { mode: 0o600, flag: "wx" });
    const relocated = await cli(["scheduler-status"], relocatedAuth);
    assert.equal(relocated.status, 0, relocated.stderr);
    assert.match(relocated.stdout, /存在未决/);
    const bad = await add("state-v2", "global", idle);
    await p.db.pool.query("UPDATE audit_events SET created_at='2000-01-01' WHERE id=$1", [bad]);
    await f.unchanged(async () => {
      await assert.rejects(status(p, f.admin.headers), { status: 503 });
    });
    assert.equal((await cli(["scheduler-status"])).status, 1);
    for (const after of [{ ...idle, version: 2 }, { ...idle, extra: true }, null]) {
      await p.db.pool.query(
        "UPDATE audit_events SET action='state-v1',after=$1::jsonb WHERE id=$2",
        [JSON.stringify(after), bad],
      );
      await f.unchanged(async () => {
        await assert.rejects(status(p, f.admin.headers), { status: 503 });
      });
    }
    await p.db.pool.query("DELETE FROM audit_events WHERE id=ANY($1::int[])", [controls]);
    await add("pending-v1", "b".repeat(64), { version: 1 });
    await f.unchanged(async () => {
      await assert.rejects(status(p, f.admin.headers), { status: 503 });
    });
    await p.db.pool.query("DELETE FROM audit_events WHERE id=ANY($1::int[])", [controls]);
    await p.db.pool.query("ALTER TABLE audit_events ADD COLUMN recovery_read_probe text");
    probe = true;
    assert.equal((await cli(["scheduler-status"], auth, { NODE_ENV: "development" })).status, 0);
    assert.equal(
      (
        await p.db.pool.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='recovery_read_probe'",
        )
      ).rowCount,
      1,
    );
    assert.deepEqual(readFileSync(types), typesBefore);
    assert.equal(statSync(types).mtimeMs, typesTime);
    assert.equal(existsSync(marker), false);
    console.log(
      "PASS readonly scheduler CLI: strict latest state, orphan rejection, native authority, private files, relocated private inputs, no schema/mail effects",
    );
  } finally {
    if (probe) await p.db.pool.query("ALTER TABLE audit_events DROP COLUMN recovery_read_probe");
    rmSync(files, { recursive: true, force: true });
    await f.cleanup();
  }
}
