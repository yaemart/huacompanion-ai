import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  subscriptionLockKey,
  credentialDigest,
  confirmSubscription,
  unsubscribeSubscription,
} from "../../src/server/subscriptions";
import { customerHash } from "../../src/lib/customer";
import { createLocalReq, logoutOperation, type Payload } from "payload";
import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition, shanghaiToday } from "../../src/lib/exhibitions";
import { mutateContent } from "../../src/server/content/service";
import { transactionSession } from "../../src/server/db-types";
import {
  previewExhibitionReminders,
  applyExhibitionReminders,
} from "../../src/server/exhibition-reminders";
import { testExhibitionReminderPool } from "./exhibition-reminder-pool";
import { databaseFingerprints } from "./database-fingerprints";

export async function testExhibitionReminders(p: Payload) {
  assert.equal(process.env.APP_ENV, "local");
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  const env = { ...process.env };
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  const key = "reminder-" + randomUUID();
  const scope = { key, locale: "zh" as const };
  const people: number[] = [],
    drafts: number[] = [],
    subs: number[] = [];
  const person = async (role: "admin" | "editor" | "manager") => {
    const password = randomBytes(32).toString("hex");
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "Fictional reminder",
        email: `${role}-${people.length}-${key}@example.invalid`,
        password,
        active: true,
        role,
        ...(role === "editor" ? { contentKinds: ["exhibition" as const] } : {}),
      },
    });
    people.push(user.id);
    const token = (await p.login({ collection: "staff", data: { email: user.email, password } }))
      .token!;
    return { user, password, headers: new Headers({ authorization: "JWT " + token }) };
  };
  const logout = async (headers: Headers) => {
    const { user } = await p.auth({ headers });
    assert.ok(user);
    return logoutOperation({
      collection: p.collections.staff,
      req: await createLocalReq({ user }, p),
    });
  };
  const unchanged = async (work: () => Promise<unknown>) => {
    const before = await databaseFingerprints(db);
    await work();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  let today = "2027-02-08",
    now = "2027-02-08T04:00:00.000Z";
  const originalBegin = p.db.beginTransaction.bind(p.db);
  const originalFetch = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    throw Error("No outbound allowed in local reminder acceptance");
  };
  // Guarded fixture-only I/O adapter; production has no date override option.
  p.db.beginTransaction = async (...args) => {
    const id = await originalBegin(...args);
    if (id) {
      const session = transactionSession(p, id),
        execute = session.db.execute.bind(session.db);
      session.db.execute = (async (...query: Parameters<typeof execute>) => {
        const result = await execute(...query);
        if (typeof query[0] === "string" && query[0].includes("exhibition-reminder-clock"))
          return { ...result, rows: [{ today, now }] };
        return result;
      }) as unknown as typeof session.db.execute;
    }
    return id;
  };
  try {
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      PRIVACY_VERSION: "reminder-v1",
      SITE_LOCALES: "en,zh",
      SUBSCRIPTION_REQUESTS_ENABLED: "false",
      WORKFLOW_MAIL_ENABLED: "false",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "false",
    });
    const admin = await person("admin");
    const body: ContentBody = {
      kind: "exhibition",
      locale: "zh",
      contentKey: key,
      slug: key,
      title: "Fictional approved reminder fair",
      summary: "Fictional only",
      blocks: [{ type: "paragraph", text: "Fictional reminder test only." }],
      sources: [
        {
          id: "official",
          title: "Fictional official source",
          url: "https://example.invalid/fair",
          checkedAt: shanghaiToday(),
        },
      ],
      exhibition: {
        ...emptyExhibition(),
        edition: "Fictional 2027",
        audience: "Fictional buyers",
        exhibits: "Fictional hardware",
        status: "announced",
        startDate: "2027-03-10",
        endDate: "2027-03-12",
        city: "shanghai",
        industries: ["hardware"],
        venue: "Fictional venue",
        address: "Fictional address",
        admission: "Fictional admission",
        officialURL: "https://example.invalid/fair",
        verifiedAt: shanghaiToday(),
      },
    };
    let d = await mutateContent(p, admin.user, { action: "save", body });
    drafts.push(d.id);
    d = await mutateContent(p, admin.user, { action: "submit", id: d.id, revision: d.revision });
    d = await mutateContent(p, admin.user, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      exhibitionReviewed: true,
      overrideReason: "Fictional reminder acceptance",
    });
    const sub = await p.create({
      collection: "subscriptions",
      data: {
        email: `recipient-${key}@example.invalid`,
        topic: "exhibition:" + key,
        locale: "zh",
        status: "confirmed",
        consentVersion: 1,
        privacyVersion: "reminder-v1",
        consentedAt: "2026-11-26T00:00:00.000Z",
        confirmedAt: "2026-11-26T00:01:00.000Z",
        sourcePath: "/zh/exhibitions/" + key,
      },
    });
    subs.push(sub.id);
    const previewFor = () => previewExhibitionReminders(p, admin.headers, scope);
    for (const [day, expected] of [
      ["2027-02-07", null],
      ["2027-02-08", 30],
      ["2027-02-09", null],
      ["2027-03-02", null],
      ["2027-03-03", 7],
      ["2027-03-04", null],
      ["2027-03-10", null],
    ] as const) {
      today = day;
      now = day + "T04:00:00.000Z";
      await unchanged(async () => {
        const result = await previewFor();
        assert.equal(result.offset, expected);
        assert.equal(result.counts.create, expected ? 1 : 0);
      });
    }
    today = "2027-02-08";
    now = today + "T04:00:00.000Z";
    for (const mode of ["trial", "production", "ci"]) {
      process.env.APP_ENV = mode;
      await unchanged(() => assert.rejects(previewFor(), { status: 403 }));
    }
    process.env.APP_ENV = "local";
    for (const [name, value] of [
      ["SUBSCRIPTIONS_ENABLED", "false"],
      ["PRIVACY_VERSION", ""],
      ["SITE_LOCALES", "zh"],
      ["PAYLOAD_SECRET", "short"],
      ["TRIAL_ACCESS_REQUIRED", "invalid"],
    ]) {
      const old = process.env[name];
      process.env[name] = value;
      await unchanged(async () => {
        const report = await previewFor();
        assert.equal(report.blocked, true);
        assert.equal(report.receipt, undefined);
      });
      if (old === undefined) delete process.env[name];
      else process.env[name] = old;
    }
    await unchanged(() =>
      assert.rejects(previewExhibitionReminders(p, admin.headers, { ...scope, extra: true }), {
        status: 400,
      }),
    );
    await unchanged(async () =>
      assert.equal(
        (await previewExhibitionReminders(p, admin.headers, { ...scope, locale: "en" })).counts
          .create,
        0,
      ),
    );
    // A private draft must neither change the published snapshot nor the seal.
    d = await mutateContent(p, admin.user, {
      action: "save",
      id: d.id,
      revision: d.revision,
      body: { ...body, title: "UNAPPROVED private title" },
    });
    assert.equal((await previewFor()).snapshot?.title, body.title);
    const stale = await previewFor();
    await p.update({ collection: "subscriptions", id: sub.id, data: { status: "unsubscribed" } });
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, stale.receipt), { status: 409 }),
    );
    await p.update({ collection: "subscriptions", id: sub.id, data: { status: "confirmed" } });
    const expiring = await previewFor();
    now = "2027-02-08T04:10:00.001Z";
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, expiring.receipt), { status: 409 }),
    );
    now = "2027-02-08T04:00:00.000Z";
    await unchanged(() =>
      assert.rejects(
        applyExhibitionReminders(
          p,
          admin.headers,
          expiring.receipt!.slice(0, -1) + (expiring.receipt!.endsWith("a") ? "b" : "a"),
        ),
        { status: 409 },
      ),
    );
    today = "2027-02-09";
    now = today + "T04:00:00.000Z";
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, expiring.receipt), { status: 409 }),
    );
    today = "2027-02-08";
    now = today + "T04:00:00.000Z";
    // Real suppression digest, with the same private event/FK as H.
    const event = await p.create({
      collection: "subscription-campaign-feedback",
      data: {
        eventId: randomUUID(),
        recipientHash: customerHash(sub.email),
        kind: "provider-suppressed",
        occurredAt: new Date().toISOString(),
        sourceHash: "fictional-reminder",
      },
    });
    const suppression = await p.create({
      collection: "subscription-marketing-suppressions",
      data: {
        recipientHash: customerHash(sub.email),
        reason: "provider-suppressed",
        event: event.id,
      },
    });
    assert.equal((await previewFor()).counts.create, 0);
    await p.delete({ collection: "subscription-marketing-suppressions", id: suppression.id });
    await p.delete({ collection: "subscription-campaign-feedback", id: event.id });
    // 1001 eligible is rejected as a whole, never truncated to 1000.
    await db.query(
      `INSERT INTO subscriptions(email,topic,locale,status,consent_version,privacy_version,consented_at,confirmed_at,source_path)
      SELECT 'cap-'||n||'-'||$1||'@example.invalid',$2,'zh','confirmed',1,'reminder-v1',now(),now(),'/zh' FROM generate_series(1,1000) n`,
      [key, sub.topic],
    );
    await unchanged(() => assert.rejects(previewFor(), { status: 400 }));
    await db.query("DELETE FROM subscriptions WHERE email LIKE $1", [
      "cap-%-" + key + "@example.invalid",
    ]);
    // Actual topic-credential confirmation waits behind the same topic lock.
    const pending = await p.create({
      collection: "subscriptions",
      data: {
        ...sub,
        id: undefined,
        email: `pending-${key}@example.invalid`,
        status: "pending",
        confirmedAt: null,
      },
    });
    subs.push(pending.id);
    const token = randomBytes(32).toString("hex");
    await p.create({
      collection: "subscription-credentials",
      data: {
        subscription: pending.id,
        purpose: "confirm",
        version: 1,
        tokenHash: credentialDigest("confirm", token),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const waitFor = async (query: string, values: unknown[]) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if ((await db.query(query, values)).rows.length) return;
        await delay(10);
      }
      assert.fail("Expected real PostgreSQL blocking was not observed");
    };
    const holder = new pg.Client({ connectionString: process.env.DATABASE_URL! });
    await holder.connect();
    try {
      // Content changed while generation waits for the content lock: stale, zero writes.
      const contentPreview = await previewFor();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(726271)");
      const blocked = applyExhibitionReminders(p, admin.headers, contentPreview.receipt).then(
        () => null,
        (e) => e,
      );
      await waitFor(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=0 AND objid=726271",
        [],
      );
      await holder.query("UPDATE content_published SET active=false WHERE draft_id=$1", [d.id]);
      await holder.query("COMMIT");
      await unchanged(async () => assert.equal((await blocked)?.status, 409));
      await db.query("UPDATE content_published SET active=true WHERE draft_id=$1", [d.id]);
      // Generation locks pending mailboxes too; real confirmation completes first.
      const pendingPreview = await previewFor();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        subscriptionLockKey(pending.email, ""),
      ]);
      const applying = applyExhibitionReminders(p, admin.headers, pendingPreview.receipt).then(
        () => null,
        (e) => e,
      );
      await waitFor("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [
        (await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      ]);
      assert.equal(await confirmSubscription(p, token), true);
      await holder.query("COMMIT");
      await unchanged(async () => assert.equal((await applying)?.status, 409));
      await p.update({
        collection: "subscriptions",
        id: pending.id,
        data: { status: "unsubscribed" },
      });
    } finally {
      await holder.query("ROLLBACK");
      await holder.end();
    }
    const relogin = async () => {
      admin.headers = new Headers({
        authorization:
          "JWT " +
          (
            await p.login({
              collection: "staff",
              data: { email: admin.user.email, password: admin.password },
            })
          ).token,
      });
    };
    const lockKeeper = await person("admin");
    const authorityPreview = await previewFor();
    const authorityID = await p.db.beginTransaction();
    assert.ok(authorityID);
    const authorityDB = transactionSession(p, authorityID).db,
      authorityExecute = authorityDB.execute.bind(authorityDB);
    let releaseAuthority!: () => void, reachedAuthority!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      reachedAuthority = resolve;
    });
    authorityDB.execute = (async (...query: Parameters<typeof authorityExecute>) => {
      if (typeof query[0] === "string" && query[0].includes("726272")) {
        reachedAuthority();
        await release;
      }
      return authorityExecute(...query);
    }) as unknown as typeof authorityDB.execute;
    try {
      // Native p.update naturally acquires business first; no test-preacquired authority lock.
      const revoking = p
        .update({
          collection: "staff",
          id: admin.user.id,
          user: lockKeeper.user,
          req: { transactionID: authorityID },
          data: { active: false },
        })
        .then(
          async () => {
            await p.db.commitTransaction(authorityID);
            return null;
          },
          (error) => error,
        );
      await Promise.race([
        reached,
        revoking.then((error) => {
          throw error || Error("Authority hook not reached");
        }),
      ]);
      const waiting = applyExhibitionReminders(p, admin.headers, authorityPreview.receipt).then(
        () => null,
        (e) => e,
      );
      await waitFor(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=0 AND objid=726281",
        [],
      );
      releaseAuthority();
      const [revoked, generated] = await Promise.all([revoking, waiting]);
      assert.equal(revoked, null, "Native revocation must commit without deadlock");
      assert.equal(generated?.status, 403);
      assert.equal((await p.findByID({ collection: "staff", id: admin.user.id })).active, false);
    } finally {
      releaseAuthority();
      authorityDB.execute = authorityExecute;
      await p.db.rollbackTransaction(authorityID);
    }
    await p.update({
      collection: "staff",
      id: admin.user.id,
      user: lockKeeper.user,
      data: { active: true },
    });
    await relogin();
    // PostgreSQL's variable fractional-second text format must preserve newest withdrawal.
    const duplicate = (
      await db.query(
        `INSERT INTO subscriptions(email,topic,locale,status,consent_version,privacy_version,consented_at,confirmed_at,source_path)
      SELECT ' '||upper(email)||' ',topic,locale,'unsubscribed',consent_version,privacy_version,consented_at+interval '0.001 seconds',confirmed_at,source_path
      FROM subscriptions WHERE id=$1 RETURNING id`,
        [sub.id],
      )
    ).rows[0].id;
    try {
      await unchanged(async () => assert.equal((await previewFor()).counts.create, 0));
    } finally {
      await db.query("DELETE FROM subscriptions WHERE id=$1", [duplicate]);
    }
    await unchanged(async () =>
      assert.equal(
        (await previewExhibitionReminders(p, admin.headers, { locale: "zh", key })).receipt,
        (await previewFor()).receipt,
      ),
    );
    const sessionHolder = new pg.Client({ connectionString: process.env.DATABASE_URL! });
    await sessionHolder.connect();
    try {
      const sessionPreview = await previewFor();
      await sessionHolder.query("BEGIN");
      await sessionHolder.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        subscriptionLockKey(sub.email, ""),
      ]);
      const waiting = applyExhibitionReminders(p, admin.headers, sessionPreview.receipt).then(
        () => null,
        (e) => e,
      );
      await waitFor("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [
        (await sessionHolder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      ]);
      assert.equal(await logout(admin.headers), true);
      await sessionHolder.query("COMMIT");
      await unchanged(async () => assert.equal((await waiting)?.status, 403));
    } finally {
      await sessionHolder.query("ROLLBACK");
      await sessionHolder.end();
    }
    await relogin();
    // An audit failure must roll back new jobs too.
    const atomicPreview = await previewFor(),
      originalCreate = p.create.bind(p);
    p.create = ((args: Parameters<typeof p.create>[0]) => {
      if (args.collection === "audit-events")
        return Promise.reject(Error("fictional audit failure"));
      return originalCreate(args);
    }) as typeof p.create;
    try {
      await unchanged(() =>
        assert.rejects(
          applyExhibitionReminders(p, admin.headers, atomicPreview.receipt),
          /fictional audit failure/,
        ),
      );
    } finally {
      p.create = originalCreate;
    }
    const lostCommit = await previewFor(),
      originalCommit = p.db.commitTransaction.bind(p.db);
    p.db.commitTransaction = (async (id) => {
      await p.db.rollbackTransaction(id);
    }) as typeof p.db.commitTransaction;
    try {
      await unchanged(() =>
        assert.rejects(applyExhibitionReminders(p, admin.headers, lostCommit.receipt), {
          status: 409,
        }),
      );
    } finally {
      p.db.commitTransaction = originalCommit;
    }
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { scope: { equals: JSON.stringify([key, "zh"]) } },
        })
      ).totalDocs,
      0,
    );
    let preview: Awaited<ReturnType<typeof previewExhibitionReminders>>;
    await unchanged(async () => {
      preview = await previewExhibitionReminders(p, admin.headers, scope);
    });
    assert.equal(preview!.counts.create, 1);
    assert.equal(preview!.offset, 30);
    assert.doesNotMatch(
      JSON.stringify(preview!),
      /recipient-|recipientHash|subscription|confirmedAt/,
    );
    for (const headers of [
      new Headers(),
      (await person("editor")).headers,
      (await person("manager")).headers,
    ])
      await unchanged(() =>
        assert.rejects(previewExhibitionReminders(p, headers, scope), { status: 403 }),
      );
    now = "2027-02-08T04:00:01.000Z";
    const uncommitted = await previewFor();
    now = "2027-02-08T04:00:02.000Z";
    const before = await databaseFingerprints(db);
    const generated = await applyExhibitionReminders(p, admin.headers, preview!.receipt);
    assert.equal(generated.counts.create, 1);
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { subscription: { equals: sub.id } },
        })
      ).totalDocs,
      1,
    );
    const others = (rows: Awaited<ReturnType<typeof databaseFingerprints>>) =>
      rows.filter((r) => !["exhibition_reminder_jobs", "audit_events"].includes(r.table));
    assert.deepEqual(others(await databaseFingerprints(db)), others(before));
    await unchanged(async () =>
      assert.equal(
        (await applyExhibitionReminders(p, admin.headers, preview!.receipt)).replayed,
        true,
      ),
    );
    mkdirSync(".local", { recursive: true });
    const historyFile = resolve(".local", key + "-history.json");
    writeFileSync(
      historyFile,
      JSON.stringify({
        email: admin.user.email,
        password: admin.password,
        receipt: preview!.receipt,
        uncommitted: uncommitted.receipt,
        asOf: generated.asOf,
      }),
      { mode: 0o600, flag: "wx" },
    );
    try {
      const output = execFileSync(
        process.execPath,
        ["--import", "tsx", "tests/helpers/exhibition-reminder-history.ts", historyFile],
        {
          env: {
            ...process.env,
            PAYLOAD_SECRET: randomBytes(32).toString("hex"),
            SUBSCRIPTIONS_ENABLED: "false",
            DOTENV_CONFIG_PATH: "/dev/null",
          },
          encoding: "utf8",
        },
      );
      assert.match(output, /PASS reminder history/);
      assert.doesNotMatch(output, new RegExp(admin.password));
    } finally {
      unlinkSync(historyFile);
    }
    const keeper = await person("admin");
    await p.update({
      collection: "staff",
      user: keeper.user,
      id: admin.user.id,
      data: { active: false },
    });
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, preview!.receipt), { status: 403 }),
    );
    await p.update({
      collection: "staff",
      user: keeper.user,
      id: admin.user.id,
      data: { active: true },
    });
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, preview!.receipt), { status: 403 }),
    );
    admin.headers = new Headers({
      authorization:
        "JWT " +
        (
          await p.login({
            collection: "staff",
            data: { email: admin.user.email, password: admin.password },
          })
        ).token,
    });
    assert.equal(await logout(keeper.headers), true);
    await unchanged(() =>
      assert.rejects(previewExhibitionReminders(p, keeper.headers, scope), { status: 403 }),
    );
    process.env.SUBSCRIPTIONS_ENABLED = "false";
    today = "2027-03-04";
    now = "2027-03-04T04:00:00.000Z";
    await unchanged(async () =>
      assert.equal(
        (await applyExhibitionReminders(p, admin.headers, preview!.receipt)).replayed,
        true,
      ),
    );
    process.env.SUBSCRIPTIONS_ENABLED = "true";
    const cancel = await previewExhibitionReminders(p, admin.headers, scope);
    assert.equal(cancel.counts.create, 0);
    assert.equal(cancel.counts.cancel, 1);
    await applyExhibitionReminders(p, admin.headers, cancel.receipt);
    assert.equal(
      (
        await p.find({
          collection: "exhibition-reminder-jobs",
          depth: 0,
          where: { subscription: { equals: sub.id } },
        })
      ).docs[0].body &&
        (
          (
            await p.find({
              collection: "exhibition-reminder-jobs",
              depth: 0,
              where: { subscription: { equals: sub.id } },
            })
          ).docs[0].body as { status: string }
        ).status,
      "local-cancelled",
    );
    today = "2027-02-08";
    now = "2027-02-08T04:00:00.000Z";
    const terminal = await previewExhibitionReminders(p, admin.headers, scope);
    assert.equal(terminal.counts.create, 0);
    today = "2027-03-03";
    now = today + "T04:00:00.000Z";
    await p.update({ collection: "subscriptions", id: pending.id, data: { status: "confirmed" } });
    const seven = await previewFor();
    assert.equal(seven.counts.create, 2); // pending row was genuinely confirmed under its lock.
    const parallel = await Promise.all([
      applyExhibitionReminders(p, admin.headers, seven.receipt),
      applyExhibitionReminders(p, admin.headers, seven.receipt),
    ]);
    assert.equal(parallel.filter((r) => r.replayed).length, 1);
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { scope: { equals: JSON.stringify([key, "zh"]) } },
        })
      ).totalDocs,
      3,
    );
    // Actual unsubscribe invalidates the historical held row only upon explicit apply.
    const unsubToken = randomBytes(32).toString("hex");
    await p.create({
      collection: "subscription-credentials",
      data: {
        subscription: pending.id,
        purpose: "unsubscribe",
        version: 1,
        tokenHash: credentialDigest("unsubscribe", unsubToken),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    assert.equal(await unsubscribeSubscription(p, unsubToken), true);
    await unchanged(async () => assert.equal((await previewFor()).counts.cancel, 1));
    const changedSource = await previewFor();
    d = await mutateContent(p, admin.user, { action: "submit", id: d.id, revision: d.revision });
    d = await mutateContent(p, admin.user, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      exhibitionReviewed: true,
      overrideReason: "Fictional reminder new revision",
    });
    await unchanged(() =>
      assert.rejects(applyExhibitionReminders(p, admin.headers, changedSource.receipt), {
        status: 409,
      }),
    );
    const revised = await previewFor();
    assert.equal(revised.counts.create, 1);
    assert.equal(revised.counts.cancel, 2);
    await applyExhibitionReminders(p, admin.headers, revised.receipt);
    // Opposite order: generation owns content; real unpublish waits until it commits.
    const holder2 = new pg.Client({ connectionString: process.env.DATABASE_URL! });
    await holder2.connect();
    try {
      const current = await previewFor();
      await holder2.query("BEGIN");
      await holder2.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        subscriptionLockKey(sub.email, ""),
      ]);
      const applying = applyExhibitionReminders(p, admin.headers, current.receipt);
      const pid = (await holder2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await waitFor("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [pid]);
      const unpublish = mutateContent(p, admin.user, {
        action: "unpublish",
        id: d.id,
        revision: d.revision,
        overrideReason: "Fictional reverse lock acceptance",
      });
      await waitFor(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=0 AND objid=726271",
        [],
      );
      await holder2.query("COMMIT");
      await applying;
      d = await unpublish;
      await unchanged(async () => {
        const report = await previewFor();
        assert.equal(report.counts.create, 0);
        assert.equal(report.counts.cancel, 1);
      });
    } finally {
      await holder2.query("ROLLBACK");
      await holder2.end();
    }
    await db.query(
      `INSERT INTO subscriptions(email,topic,locale,status,consent_version,privacy_version,consented_at,confirmed_at,source_path)
      SELECT 'cancelcap-'||n||'-'||$1||'@example.invalid',$2,'zh','confirmed',1,'reminder-v1',now(),now(),'/zh' FROM generate_series(1,1000) n`,
      [key, sub.topic],
    );
    try {
      const cancelling = await previewFor();
      assert.equal(cancelling.counts.subscribers, 1001);
      assert.equal(cancelling.counts.eligible, 0);
      assert.equal(cancelling.counts.cancel, 1);
      const frozenOldTables = others(await databaseFingerprints(db));
      await applyExhibitionReminders(p, admin.headers, cancelling.receipt);
      assert.deepEqual(others(await databaseFingerprints(db)), frozenOldTables);
    } finally {
      await db.query("DELETE FROM subscriptions WHERE email LIKE $1", [
        "cancelcap-%-" + key + "@example.invalid",
      ]);
    }
    await testExhibitionReminderPool(p);
    assert.equal(outbound, 0);
    console.log(
      "PASS exhibition reminder core: authenticated read-only preview, 30-day local generation, terminal cancellation, history replay and old tables unchanged",
    );
  } finally {
    p.db.beginTransaction = originalBegin;
    globalThis.fetch = originalFetch;
    await db.query("DELETE FROM exhibition_reminder_jobs WHERE scope=$1", [
      JSON.stringify([scope.key, scope.locale]),
    ]);
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { scope: { equals: JSON.stringify([key, "zh"]) } },
        })
      ).totalDocs,
      0,
    );
    await db.query(
      "DELETE FROM audit_events WHERE entity='exhibition-reminder-jobs' AND after->>'scope'=$1",
      [JSON.stringify([scope.key, scope.locale])],
    );
    for (const id of subs) {
      await db.query("DELETE FROM subscription_credentials WHERE subscription_id=$1", [id]);
      await p.delete({ collection: "subscriptions", id });
    }
    for (const id of drafts) {
      await db.query("DELETE FROM content_published WHERE draft_id=$1", [id]);
      await p.delete({ collection: "content-drafts", id });
    }
    // Fixture audit actor references are retained until database disposal by the driver.
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
    await db.end();
  }
}
