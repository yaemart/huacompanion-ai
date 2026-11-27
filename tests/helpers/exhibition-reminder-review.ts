import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Payload } from "payload";
import { recoveryFixture } from "./exhibition-reminder-recovery-fixture";
import {
  withExhibitionScheduler,
  type SchedulerSession,
} from "../../src/server/exhibition-reminder-scheduler-control";
import { applyExhibitionReminders } from "../../src/server/exhibition-reminders";
import { readExhibitionSchedulerStatus } from "../../src/server/exhibition-reminder-scheduler-state";
import { transactionSession } from "../../src/server/db-types";
export const schedulerLocks = (p: Payload) =>
  p.db.pool.query(
    "SELECT pid FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND objid=726291 AND granted",
  );
export async function testExhibitionSchedulerReview(p: Payload) {
  const selected = process.env.HUA_REVIEW_CASE;
  for (const mode of ["factory", "self-resolve", "isolation", "stale", "foreign-lock", "cli"]) {
    if (selected && selected !== mode) continue;
    const f = await recoveryFixture(p);
    try {
      if (mode === "factory") {
        const path = "../../src/server/exhibition-reminder-scheduler-guard";
        const module = await import(path).catch(() => ({}));
        assert.equal(module.schedulerPermit, undefined, "only actual sessions can issue permits");
        let saved: SchedulerSession;
        let run = "";
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          saved = s;
          run = (await s.begin([f.scope])).runId;
          await s.prepare(run, f.receipt);
        });
        await f.unchanged(async () => {
          await assert.rejects(saved!.apply(run, f.receipt), { status: 409 });
          await assert.rejects(
            applyExhibitionReminders(p, f.admin.headers, f.receipt, {} as never),
            { status: 409 },
          );
        });
      }
      if (mode === "self-resolve")
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          const { runId } = await s.begin([f.scope]);
          const { revision } = await s.prepare(runId, f.receipt);
          await f.unchanged(async () => {
            await assert.rejects(s.resolve(revision, "Same live run"), { status: 409 });
          });
        });
      if (mode === "stale") {
        let old = 0;
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          const r = await s.begin([f.scope]);
          old = r.revision;
          await s.stop(r.runId);
        });
        let revision = 0;
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          const { runId } = await s.begin([f.scope]);
          revision = (await s.prepare(runId, f.receipt)).revision;
        });
        await f.unchanged(async () => {
          await assert.rejects(
            withExhibitionScheduler(p, f.other.headers, (s) =>
              s.resolve(old || 1, "Stale version against real new pending"),
            ),
            { status: 409 },
          );
        });
        const current = await readExhibitionSchedulerStatus(p, f.admin.headers);
        assert.equal(current.revision, revision);
        await withExhibitionScheduler(p, f.other.headers, (s) =>
          s.resolve(revision, "Actual current version"),
        );
      }
      if (mode === "isolation")
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          const { runId } = await s.begin([f.scope]);
          const commit = p.db.commitTransaction,
            begin = p.db.beginTransaction;
          let unlock!: () => void, entered!: () => void;
          const held = new Promise<void>((r) => {
            entered = r;
          });
          const release = new Promise<void>((r) => {
            unlock = r;
          });
          let first = true;
          p.db.commitTransaction = async (id) => {
            if (first) {
              first = false;
              entered();
              await release;
            }
            await commit.call(p.db, id);
          };
          let pid = 0;
          try {
            const preparing = s.prepare(runId, f.receipt);
            await held;
            p.db.beginTransaction = async (...args) => {
              const id = await begin.call(p.db, ...args);
              assert.ok(id);
              await transactionSession(p, id).db.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
              );
              pid = 1;
              return id;
            };
            const applying = applyExhibitionReminders(p, f.admin.headers, f.receipt);
            const rejected = assert.rejects(applying, { status: 409 });
            const deadline = Date.now() + 5000;
            while (
              !pid ||
              !(
                await p.db.pool.query(
                  "SELECT 1 FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid=726271 AND NOT granted",
                )
              ).rowCount
            ) {
              assert.ok(Date.now() < deadline, "manual write waits on actual prepare lock");
              await new Promise((r) => setTimeout(r, 10));
            }
            unlock();
            await preparing;
            await rejected;
          } finally {
            unlock();
            p.db.commitTransaction = commit;
            p.db.beginTransaction = begin;
          }
        });
      if (mode === "cli") {
        await withExhibitionScheduler(p, f.admin.headers, async (s) => {
          const { runId } = await s.begin([f.scope]);
          await s.prepare(runId, f.receipt);
        });
        const dir = mkdtempSync(join(tmpdir(), "hua-review-cli-"));
        try {
          const auth = join(dir, "other.jwt");
          writeFileSync(auth, f.other.headers.get("authorization")!.slice(4), { mode: 0o600 });
          const r = spawnSync(
            process.execPath,
            [
              "--import",
              "tsx",
              "scripts/exhibition-reminders.ts",
              "scheduler-resolve",
              "--auth-file",
              auth,
              "--revision",
              "1",
              "--reason",
              "Review stale version",
            ],
            { encoding: "utf8", timeout: 20000 },
          );
          assert.equal(r.status, 1);
          assert.match(r.stderr, /scheduler-status/);
          assert.doesNotMatch(r.stderr, /原回执|重新预检/);
        } finally {
          rmSync(dir, { recursive: true });
        }
      }
      if (mode === "foreign-lock") {
        const name = "hua_subscriptions_" + randomUUID().replaceAll("-", "");
        await p.db.pool.query(`CREATE DATABASE "${name}"`);
        const url = new URL(process.env.DATABASE_URL!);
        url.pathname = "/" + name;
        const foreign = new pg.Client({ connectionString: url.href });
        try {
          await foreign.connect();
          await foreign.query("SELECT pg_advisory_lock(726291)");
          await withExhibitionScheduler(p, f.admin.headers, async () => {
            assert.equal(
              (await schedulerLocks(p)).rowCount,
              1,
              "lock observations exclude other databases",
            );
          });
        } finally {
          await foreign.end();
          await p.db.pool.query(`DROP DATABASE "${name}" WITH(FORCE)`);
        }
      }
    } finally {
      await f.cleanup();
    }
  }
}
