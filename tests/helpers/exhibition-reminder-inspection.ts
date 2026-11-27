import assert from "node:assert/strict";
import { createLocalReq, logoutOperation, type Payload } from "payload";
import { SignJWT, decodeJwt, decodeProtectedHeader } from "jose";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  previewExhibitionReminders,
  applyExhibitionReminders,
} from "../../src/server/exhibition-reminders";
import { transactionSession } from "../../src/server/db-types";
import { reminderHash } from "../../src/lib/exhibition-reminders";
import { recoveryFixture, assertRecoveryDatabase } from "./exhibition-reminder-recovery-fixture";

export async function testExhibitionReminderInspection(p: Payload) {
  assertRecoveryDatabase();
  const api = await import("../../src/server/exhibition-reminder-history").catch(() => null);
  assert.ok(api?.inspectExhibitionReminder, "true read-only receipt inspection must exist");
  const inspect = api.inspectExhibitionReminder;
  const f = await recoveryFixture(p);
  try {
    await f.unchanged(async () => {
      assert.deepEqual(await inspect(p, f.admin.headers, f.receipt), {
        state: "not-found",
        scope: f.scope,
        currentEligibility: "not-checked",
      });
      for (const headers of [f.other.headers, f.manager.headers, new Headers()])
        await assert.rejects(inspect(p, headers, f.receipt), { status: 403 });
    });
    const committed = await applyExhibitionReminders(p, f.admin.headers, f.receipt);
    assert.equal(committed.counts.create, 1);
    await f.unchanged(async () => {
      const result = await inspect(p, f.admin.headers, f.receipt);
      assert.equal(result.state, "committed");
      if (result.state !== "committed") throw Error("Expected committed history");
      assert.equal(result.report.asOf, committed.asOf);
      assert.equal(result.report.counts.create, 1);
      assert.equal(result.report.replayed, true);
      assert.equal(result.report.currentEligibility, "not-checked");
      assert.equal("receipt" in result.report, false);
      const all = await Promise.all(
        Array.from({ length: 10 }, () => inspect(p, f.admin.headers, f.receipt)),
      );
      assert.equal(all.filter((r) => r.state === "committed").length, 10);
    });
    const auth = await import("../../src/server/exhibition-reminder-authority");
    const audit = (
      await p.find({
        collection: "audit-events",
        depth: 0,
        where: {
          and: [
            { action: { equals: "generate-local" } },
            { recordId: { equals: reminderHash(f.receipt) } },
          ],
        },
      })
    ).docs[0];
    const originalAfter = audit.after;
    try {
      const after = originalAfter as { scope: string; report: Record<string, unknown> };
      await p.db.pool.query("UPDATE audit_events SET after=$1::jsonb WHERE id=$2", [
        JSON.stringify({
          ...after,
          report: {
            ...after.report,
            email: "private@example.invalid",
            receipt: "private-receipt",
            recipientHash: "private-hash",
          },
        }),
        audit.id,
      ]);
      await f.unchanged(async () => {
        assert.doesNotMatch(
          JSON.stringify(await inspect(p, f.admin.headers, f.receipt)),
          /private@example|private-receipt|private-hash/,
        );
      });
      await p.db.pool.query("UPDATE audit_events SET after=$1::jsonb WHERE id=$2", [
        JSON.stringify({ ...after, scope: "wrong-scope" }),
        audit.id,
      ]);
      await f.unchanged(async () => {
        await assert.rejects(inspect(p, f.admin.headers, f.receipt), { status: 503 });
      });
    } finally {
      await p.db.pool.query("UPDATE audit_events SET after=$1::jsonb WHERE id=$2", [
        JSON.stringify(originalAfter),
        audit.id,
      ]);
    }
    await f.unchanged(async () => {
      await assert.rejects(
        auth.withReminderReadOnly(p, f.admin.headers, async ({ req }) => {
          await p.create({
            collection: "audit-events",
            req,
            data: { entity: "forbidden-readonly-probe", action: "probe", recordId: "probe" },
          });
        }),
        (error) =>
          !!error &&
          typeof error === "object" &&
          "cause" in error &&
          !!error.cause &&
          typeof error.cause === "object" &&
          "code" in error.cause &&
          error.cause.code === "25006",
      );
    });
    const raw = f.admin.headers.get("authorization")!.slice(4),
      claims = decodeJwt(raw);
    const signed = async (exp: number) =>
      new SignJWT({ ...claims, exp })
        .setProtectedHeader({
          alg: "HS256",
          typ: "JWT",
          authVersion: decodeProtectedHeader(raw).authVersion,
        })
        .sign(new TextEncoder().encode(p.secret));
    const live = new Headers({
      authorization: "JWT " + (await signed(Math.floor(Date.now() / 1000) + 60)),
    });
    assert.equal((await p.auth({ headers: live })).user?.id, f.admin.user.id);
    await f.unchanged(async () => {
      await assert.rejects(
        inspect(p, new Headers({ authorization: "JWT " + (await signed(1)) }), f.receipt),
        { status: 403 },
      );
    });
    const begin = p.db.beginTransaction.bind(p.db);
    let oldReceipt = "",
      oldAsOf = "";
    try {
      const clock = (
        await p.db.pool.query(
          "SELECT (statement_timestamp()-interval '1 day')::text AS now, ((statement_timestamp()-interval '1 day') AT TIME ZONE 'Asia/Shanghai')::date::text AS today",
        )
      ).rows[0];
      p.db.beginTransaction = async (...args) => {
        const id = await begin(...args);
        if (id) {
          const session = transactionSession(p, id),
            execute = session.db.execute.bind(session.db);
          session.db.execute = (async (...query: Parameters<typeof execute>) => {
            const r = await execute(...query);
            return typeof query[0] === "string" && query[0].includes("exhibition-reminder-clock")
              ? { ...r, rows: [clock] }
              : r;
          }) as typeof session.db.execute;
        }
        return id;
      };
      const old = await previewExhibitionReminders(p, f.admin.headers, f.scope);
      assert.ok(old.receipt);
      oldReceipt = old.receipt;
      oldAsOf = (await applyExhibitionReminders(p, f.admin.headers, oldReceipt)).asOf;
    } finally {
      p.db.beginTransaction = begin;
    }
    const files = mkdtempSync(join(tmpdir(), "hua-readonly-history-")),
      marker = join(files, "network");
    try {
      const uncommitted = await previewExhibitionReminders(p, f.admin.headers, f.scope);
      assert.ok(uncommitted.receipt);
      const fixture = join(files, "private.json");
      writeFileSync(
        fixture,
        JSON.stringify({
          email: f.admin.user.email,
          password: f.admin.password,
          receipt: oldReceipt,
          uncommitted: uncommitted.receipt,
          asOf: oldAsOf,
        }),
        { mode: 0o600 },
      );
      const output = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--import",
          pathToFileURL(resolve("tests/helpers/exhibition-reminder-command-session.ts")).href,
          "tests/helpers/exhibition-reminder-recovery-session.ts",
          fixture,
        ],
        {
          env: {
            ...process.env,
            PAYLOAD_SECRET: randomBytes(32).toString("hex"),
            SUBSCRIPTIONS_ENABLED: "false",
            HUA_DEMO_SCHEMA_PUSH: "false",
            DISABLE_PAYLOAD_HMR: "true",
            HUA_REMINDER_COMMAND_NETWORK_PROBE: marker,
          },
          encoding: "utf8",
          timeout: 20000,
        },
      );
      assert.match(output, /PASS fresh readonly history/);
      assert.equal(existsSync(marker), false);
      for (const secret of [f.admin.password, f.receipt, oldReceipt])
        assert.equal(output.includes(secret), false);
    } finally {
      rmSync(files, { recursive: true, force: true });
    }
    const loggingOut = (await p.auth({ headers: f.admin.headers })).user;
    assert.ok(loggingOut);
    await assert.rejects(
      auth.withReminderReadOnly(p, f.admin.headers, async () => {
        await logoutOperation({
          collection: p.collections.staff,
          req: await createLocalReq({ user: loggingOut }, p),
        });
        return "must not return stale private result";
      }),
      { status: 403 },
    );
    f.admin.headers = await f.admin.login();
    const { user } = await p.auth({ headers: f.admin.headers });
    assert.ok(user);
    await logoutOperation({
      collection: p.collections.staff,
      req: await createLocalReq({ user }, p),
    });
    await f.unchanged(async () => {
      await assert.rejects(inspect(p, f.admin.headers, f.receipt), { status: 403 });
    });
    f.admin.headers = await f.admin.login();
    const revoker = (await p.auth({ headers: f.other.headers })).user;
    assert.ok(revoker);
    await p.update({
      collection: "staff",
      id: f.admin.user.id,
      req: await createLocalReq({ user: revoker }, p),
      data: { active: false },
    });
    await f.unchanged(async () => {
      await assert.rejects(inspect(p, f.admin.headers, f.receipt), { status: 403 });
    });
    console.log(
      "PASS recovery inspection: valid uncommitted receipts never apply; committed history, native authority, readonly transaction and pooled queries",
    );
  } finally {
    await f.cleanup();
  }
}
