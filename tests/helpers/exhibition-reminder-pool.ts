import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import type { Payload } from "payload";
import {
  previewExhibitionReminders,
  applyExhibitionReminders,
} from "../../src/server/exhibition-reminders";
import { databaseFingerprints } from "./database-fingerprints";

export async function testExhibitionReminderPool(p: Payload) {
  assert.equal(process.env.APP_ENV, "local");
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  assert.equal(p.db.pool.options.max, 10);
  const poolErrors: Error[] = [];
  const onPoolError = (error: Error) => {
    poolErrors.push(error);
  };
  p.db.pool.on("error", onPoolError);
  const observer = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await observer.connect();
  const env = { ...process.env },
    password = randomBytes(32).toString("hex");
  Object.assign(process.env, {
    SUBSCRIPTIONS_ENABLED: "true",
    PRIVACY_VERSION: "pool-v1",
    SITE_LOCALES: "en,zh",
  });
  const staff = await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Fictional pool probe",
      email: `pool-${randomUUID()}@example.invalid`,
      password,
      active: true,
      role: "admin",
    },
  });
  const token = (await p.login({ collection: "staff", data: { email: staff.email, password } }))
    .token!;
  const headers = new Headers({ authorization: "JWT " + token });
  const scope = { key: "pool-" + randomUUID(), locale: "zh" as const };
  const concurrent = async (work: () => Promise<unknown>) => {
    // Bundled adapter retains one pool client for reconnect monitoring.
    const usable = p.db.pool.options.max! - (p.db.pool.totalCount - p.db.pool.idleCount);
    assert.equal(usable, 9);
    const begin = p.db.beginTransaction.bind(p.db),
      ids: (string | number)[] = [];
    let release!: () => void,
      timer: ReturnType<typeof setTimeout> | undefined,
      timedOut = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    p.db.beginTransaction = async (...args) => {
      const id = await begin(...args);
      assert.ok(id);
      ids.push(id);
      if (ids.length === usable) release();
      await gate;
      return id;
    };
    const operations = Promise.allSettled(Array.from({ length: 10 }, work));
    try {
      const results = await Promise.race([
        operations,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(Error("Reminder calls exhausted the ten-connection pool"));
          }, 15000);
        }),
      ]);
      assert.equal(ids.length, 10);
      for (const result of results)
        assert.equal(
          result.status,
          "fulfilled",
          result.status === "rejected" ? String(result.reason) : undefined,
        );
    } finally {
      if (timer) clearTimeout(timer);
      release();
      p.db.beginTransaction = begin;
      if (timedOut) {
        // Release only own captured transactions in the guarded disposable database.
        await Promise.all(ids.map((id) => p.db.rollbackTransaction(id)));
        await operations;
      }
    }
  };
  try {
    const before = await databaseFingerprints(observer);
    await concurrent(() => previewExhibitionReminders(p, headers, scope));
    assert.deepEqual(await databaseFingerprints(observer), before);
    const preview = await previewExhibitionReminders(p, headers, scope);
    await concurrent(() => applyExhibitionReminders(p, headers, preview.receipt));
    assert.equal(
      (
        await p.count({
          collection: "audit-events",
          where: {
            and: [
              { entity: { equals: "exhibition-reminder-jobs" } },
              { actor: { equals: staff.id } },
            ],
          },
        })
      ).totalDocs,
      1,
    );
    assert.deepEqual(poolErrors, []);
  } finally {
    p.db.pool.removeListener("error", onPoolError);
    await observer.query(
      "DELETE FROM audit_events WHERE entity='exhibition-reminder-jobs' AND actor_id=$1",
      [staff.id],
    );
    await p.delete({ collection: "staff", id: staff.id });
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
    await observer.end();
  }
}
