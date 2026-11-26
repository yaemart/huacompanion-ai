import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import pg from "pg";
import { createLocalReq, logoutOperation, type Payload } from "payload";
import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition, shanghaiToday } from "../../src/lib/exhibitions";
import { mutateContent } from "../../src/server/content/service";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { databaseFingerprints } from "./database-fingerprints";

export async function testExhibitionReminderCommand(p: Payload) {
  assert.equal(process.env.APP_ENV, "local");
  const url = new URL(process.env.DATABASE_URL!);
  assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(
    (url.port === "55442" && url.username === "hua_demo") ||
      (process.env.GITHUB_ACTIONS === "true" && url.port === "55438" && url.username === "hua"),
  );
  assert.ok(!url.search && !url.hash);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const env = { ...process.env },
    key = "cli-" + randomUUID(),
    scope = JSON.stringify([key, "zh"]);
  const files = mkdtempSync(join(tmpdir(), "hua reminder CLI-")),
    marker = join(files, "network");
  const sessionHelper = resolve("tests/helpers/exhibition-reminder-command-session.ts");
  const entry = resolve("scripts/exhibition-reminders.ts"),
    typesFile = resolve("payload-types.ts");
  const typesBefore = readFileSync(typesFile),
    typesTime = statSync(typesFile).mtimeMs;
  const people: number[] = [],
    subscriptions: number[] = [],
    drafts: number[] = [];
  const missingName = "hua_subscriptions_" + randomUUID().replaceAll("-", "");
  let grant: number | undefined;
  let missingWasAbsent = false;
  const childEnv = (extra: Record<string, string> = {}) => ({
    ...process.env,
    DOTENV_CONFIG_PATH: "/dev/null",
    HUA_DEMO_SCHEMA_PUSH: "true",
    HUA_REMINDER_COMMAND_NETWORK_PROBE: marker,
    PGAPPNAME: key,
    ...extra,
  });
  const execute = (program: string, args: string[], extra: Record<string, string> = {}) =>
    new Promise<{ status: number; stdout: string; stderr: string }>((resolveResult) => {
      execFile(
        program,
        args,
        { env: childEnv(extra), timeout: 20000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error && !Number.isInteger(error.code)) {
            console.log(
              "CLI_CHILD_FAILURE",
              JSON.stringify({ code: error.code, signal: error.signal, killed: error.killed }),
            );
            resolveResult({ status: -1, stdout: String(stdout), stderr: String(stderr) });
            return;
          }
          resolveResult({
            status: error ? Number(error.code) : 0,
            stdout: String(stdout),
            stderr: String(stderr),
          });
        },
      );
    });
  const legacy = (rows: Awaited<ReturnType<typeof databaseFingerprints>>) =>
    rows.filter((row) => !["exhibition_reminder_jobs", "audit_events"].includes(row.table));
  const cli = async (args: string[], extra: Record<string, string> = {}) => {
    const before = legacy(await databaseFingerprints(db));
    const receiptFile = args[args.indexOf("--receipt-file") + 1];
    const authFile = args[args.indexOf("--auth-file") + 1];
    const original = args[0] === "apply" ? readFileSync(receiptFile) : undefined;
    const result = await execute(
      process.execPath,
      ["--import", "tsx", "--import", pathToFileURL(sessionHelper).href, entry, ...args],
      extra,
    );
    assert.deepEqual(legacy(await databaseFingerprints(db)), before);
    if (original) assert.deepEqual(readFileSync(receiptFile), original);
    reportSafe(result, [
      readFileSync(authFile, "utf8").trim(),
      existsSync(receiptFile) ? readFileSync(receiptFile, "utf8").trim() : "",
      process.env.PAYLOAD_SECRET!,
      decodeURIComponent(url.password),
    ]);
    return result;
  };
  const unchanged = async (work: () => Promise<unknown>) => {
    const before = await databaseFingerprints(db);
    await work();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  const person = async (role: "admin" | "editor" | "manager") => {
    const password = randomBytes(32).toString("hex");
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "Fictional command administrator",
        email: `${role}-${people.length}-${key}@example.invalid`,
        password,
        role,
        active: true,
        ...(role === "editor" ? { contentKinds: ["exhibition" as const] } : {}),
      },
    });
    people.push(user.id);
    const authFile = join(files, role + people.length + " private.jwt");
    const login = async () => {
      const { token } = await p.login({
        collection: "staff",
        data: { email: user.email, password },
      });
      assert.ok(token);
      writeFileSync(authFile, token + "\n", { mode: 0o600 });
      return token;
    };
    const token = await login();
    return { user, password, authFile, login, token };
  };
  const readDay = async () =>
    (
      await db.query(
        "SELECT (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date::text AS today",
      )
    ).rows[0].today as string;
  const today = await readDay(),
    plus = (days: number) =>
      new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  const reportSafe = (result: { stdout: string; stderr: string }, secrets: string[]) => {
    const output = result.stdout + result.stderr;
    for (const secret of secrets.filter(Boolean))
      assert.equal(output.includes(secret), false, "Private value appeared in command output");
    assert.doesNotMatch(output, /recipientHash|subscription_id|Error:|SELECT .*staff/);
  };
  try {
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      PRIVACY_VERSION: "cli-v1",
      SITE_LOCALES: "en,zh",
      SUBSCRIPTION_REQUESTS_ENABLED: "false",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "false",
      WORKFLOW_MAIL_ENABLED: "false",
    });
    delete process.env.WORKFLOW_MAIL_API_KEY;
    delete process.env.WORKFLOW_MAIL_FROM;
    const admin = await person("admin"),
      keeper = await person("admin"),
      editor = await person("editor"),
      manager = await person("manager");
    const granted = await setCampaignGrant(p, keeper.user, {
      staffId: manager.user.id,
      topic: "policy-updates",
      enabled: true,
    });
    void granted;
    grant = (
      await p.find({
        collection: "subscription-campaign-grants",
        depth: 0,
        where: { staff: { equals: manager.user.id } },
      })
    ).docs[0]?.id;
    const body: ContentBody = {
      kind: "exhibition",
      locale: "zh",
      contentKey: key,
      slug: key,
      title: "Fictional approved CLI fair",
      summary: "Fictional local command only",
      blocks: [{ type: "paragraph", text: "Fictional test, not travel advice." }],
      sources: [
        {
          id: "official",
          title: "Fictional source",
          url: "https://example.invalid/cli-fair",
          checkedAt: shanghaiToday(),
        },
      ],
      exhibition: {
        ...emptyExhibition(),
        edition: "Fictional current edition",
        audience: "Fictional buyers",
        exhibits: "Fictional hardware",
        status: "announced",
        startDate: plus(30),
        endDate: plus(32),
        city: "shanghai",
        industries: ["hardware"],
        venue: "Fictional venue",
        address: "Fictional address",
        admission: "Fictional entry",
        officialURL: "https://example.invalid/cli-fair",
        verifiedAt: shanghaiToday(),
      },
    };
    const release = async (content: ContentBody, id?: number) => {
      const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
      let d = await mutateContent(p, admin.user, {
        action: "save",
        id,
        revision: current?.revision,
        body: content,
      });
      if (!id) drafts.push(d.id);
      d = await mutateContent(p, admin.user, { action: "submit", id: d.id, revision: d.revision });
      return mutateContent(p, admin.user, {
        action: "publish",
        id: d.id,
        revision: d.revision,
        exhibitionReviewed: true,
        overrideReason: "Fictional controlled CLI acceptance",
      });
    };
    let draft = await release(body);
    await release({ ...body, locale: "en", title: "Fictional translated CLI fair" });
    for (const [locale, status] of [
      ["zh", "confirmed"],
      ["zh", "pending"],
      ["zh", "unsubscribed"],
      ["en", "confirmed"],
    ] as const) {
      const row = await p.create({
        collection: "subscriptions",
        data: {
          email: `${subscriptions.length}-${key}@example.invalid`,
          topic: "exhibition:" + key,
          locale,
          status,
          consentVersion: 1,
          privacyVersion: "cli-v1",
          consentedAt: new Date().toISOString(),
          confirmedAt: status === "confirmed" ? new Date().toISOString() : null,
          sourcePath: "/" + locale + "/exhibitions/" + key,
        },
      });
      subscriptions.push(row.id);
    }
    const auth = admin.authFile;
    const previewArgs = (path: string, authFile = auth, locale = "zh") => [
      "preview",
      "--key",
      key,
      "--locale",
      locale,
      "--auth-file",
      authFile,
      "--receipt-file",
      path,
    ];
    const applyArgs = (path: string, authFile = auth) => [
      "apply",
      "--auth-file",
      authFile,
      "--receipt-file",
      path,
    ];
    const count = () =>
      p
        .count({ collection: "exhibition-reminder-jobs", where: { scope: { equals: scope } } })
        .then((r) => r.totalDocs);
    assert.equal(await count(), 0);
    const first = join(files, "30 day.receipt");
    await unchanged(async () => {
      const npm = resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
      const result = await execute(
        process.execPath,
        [npm, "run", "--silent", "exhibition:reminders", "--", ...previewArgs(first)],
        { NODE_OPTIONS: "--import=tsx --import=" + pathToFileURL(sessionHelper).href },
      );
      assert.match(result.stdout, /^本地预检/);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /拟新增：1/);
      assert.match(result.stdout, /档位：30天/);
      assert.match(result.stdout, /Fictional approved CLI fair/);
      assert.ok(result.stdout.includes("本届标识：" + key));
      assert.ok(result.stdout.includes(plus(30)) && result.stdout.includes(plus(32)));
      assert.match(result.stdout, /资料快照：第[1-9]\d*版/);
      assert.equal(statSync(first).mode & 0o7777, 0o600);
      reportSafe(result, [
        admin.token,
        process.env.PAYLOAD_SECRET!,
        readFileSync(first, "utf8").trim(),
        `${key}@example.invalid`,
      ]);
    });
    const english = join(files, "english.receipt");
    await unchanged(async () => {
      const result = await cli(previewArgs(english, auth, "en"));
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /translated CLI fair/);
      assert.match(result.stdout, /拟新增：1/);
    });
    draft = await mutateContent(p, admin.user, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: { ...body, title: "PRIVATE unapproved CLI title" },
    });
    await db.query("ALTER TABLE exhibition_reminder_jobs ADD COLUMN cli_preserve_probe text");
    const development = join(files, "development-no-sync.receipt");
    await unchanged(async () => {
      const result = await cli(previewArgs(development), { NODE_ENV: "development" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /拟新增：1/);
    });
    const beforeGeneration = await databaseFingerprints(db);
    const outcomes = await Promise.all([cli(applyArgs(first)), cli(applyArgs(first))]);
    assert.ok(
      outcomes.every((r) => r.status === 0),
      JSON.stringify(
        outcomes.map((r) => ({ status: r.status, stderr: r.stderr, stdout: r.stdout })),
      ),
    );
    assert.equal(outcomes.filter((r) => /历史操作/.test(r.stdout)).length, 1);
    assert.ok(outcomes.some((r) => /本次新增：1/.test(r.stdout)));
    assert.equal(await count(), 1);
    const others = (rows: Awaited<ReturnType<typeof databaseFingerprints>>) =>
      rows.filter((r) => !["exhibition_reminder_jobs", "audit_events"].includes(r.table));
    assert.deepEqual(others(await databaseFingerprints(db)), others(beforeGeneration));
    assert.equal(
      (
        await p.count({
          collection: "audit-events",
          where: {
            and: [
              { entity: { equals: "exhibition-reminder-jobs" } },
              { actor: { equals: admin.user.id } },
            ],
          },
        })
      ).totalDocs,
      1,
    );
    const held = (
      await p.find({
        collection: "exhibition-reminder-jobs",
        depth: 0,
        where: { scope: { equals: scope } },
      })
    ).docs[0].body as { status: string; snapshot: { title: string } };
    assert.equal(held.status, "local-held");
    assert.equal(held.snapshot.title, "Fictional approved CLI fair");
    for (const outcome of outcomes) {
      reportSafe(outcome, [
        admin.token,
        readFileSync(first, "utf8").trim(),
        process.env.PAYLOAD_SECRET!,
        "PRIVATE unapproved",
      ]);
      if (/历史操作/.test(outcome.stdout)) {
        assert.match(outcome.stdout, /当前资格未检查/);
        assert.doesNotMatch(outcome.stdout, /本档待发/);
      }
    }
    const fresh = join(files, "uncommitted.receipt");
    assert.equal((await cli(previewArgs(fresh))).status, 0);
    const freshBytes = readFileSync(fresh);
    await p.update({
      collection: "subscriptions",
      id: subscriptions[0],
      data: { status: "unsubscribed" },
    });
    await unchanged(async () => {
      const result = await cli(applyArgs(fresh));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /保留原回执/);
    });
    assert.deepEqual(readFileSync(fresh), freshBytes);
    await p.update({
      collection: "subscriptions",
      id: subscriptions[0],
      data: { status: "confirmed" },
    });
    const expired = join(files, "expired.receipt");
    const [encoded] = freshBytes.toString("utf8").trim().split(".");
    const seal = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    seal.at = new Date(Date.now() - 600001).toISOString();
    const oldEncoded = Buffer.from(JSON.stringify(seal)).toString("base64url");
    writeFileSync(
      expired,
      oldEncoded +
        "." +
        createHmac("sha256", process.env.PAYLOAD_SECRET!)
          .update("exhibition-reminder-v1:" + oldEncoded)
          .digest("hex"),
      { mode: 0o600 },
    );
    await unchanged(async () => {
      const result = await cli(applyArgs(expired));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /保留原回执/);
    });
    const blocked = join(files, "blocked.receipt");
    await unchanged(async () => {
      const result = await cli(previewArgs(blocked), { SUBSCRIPTIONS_ENABLED: "false" });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /阻止/);
      assert.equal(existsSync(blocked), false);
    });
    const maintenance = join(files, "maintenance.receipt");
    await unchanged(async () => {
      const result = await cli(previewArgs(maintenance), {
        TRIAL_ACCESS_REQUIRED: "true",
        TRIAL_ACCESS_USER: "fictional",
        TRIAL_ACCESS_PASSWORD: "fictional-trial-password-over32-characters",
        TRIAL_MAINTENANCE: "true",
      });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /阻止/);
      assert.equal(existsSync(maintenance), false);
    });
    for (const actor of [editor, manager])
      await unchanged(async () => {
        const result = await cli(
          previewArgs(join(files, actor.user.id + ".receipt"), actor.authFile),
        );
        assert.equal(result.status, 1);
        assert.match(result.stderr, /权限无效/);
      });
    const rotatedSecret = randomBytes(32).toString("hex"),
      rotatedAuth = join(files, "rotated.jwt"),
      fixture = join(files, "session.json");
    writeFileSync(
      fixture,
      JSON.stringify({ email: admin.user.email, password: admin.password, authFile: rotatedAuth }),
      { mode: 0o600 },
    );
    const session = await execute(process.execPath, ["--import", "tsx", sessionHelper, fixture], {
      PAYLOAD_SECRET: rotatedSecret,
    });
    assert.equal(session.status, 0, session.stderr);
    await unchanged(async () => {
      const result = await cli(applyArgs(fresh, rotatedAuth), { PAYLOAD_SECRET: rotatedSecret });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /保留原回执/);
    });
    const sameKeyControl = await cli(applyArgs(fresh));
    assert.equal(sameKeyControl.status, 0, sameKeyControl.stderr);
    assert.match(sameKeyControl.stdout, /本次新增：0/);
    assert.equal(await count(), 1);
    await unchanged(async () => {
      const result = await cli(applyArgs(first, rotatedAuth), {
        PAYLOAD_SECRET: rotatedSecret,
        SUBSCRIPTIONS_ENABLED: "false",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /历史操作/);
      assert.match(result.stdout, /当前资格未检查/);
    });
    await p.update({
      collection: "staff",
      id: admin.user.id,
      user: keeper.user,
      data: { active: false },
    });
    await unchanged(async () => {
      const result = await cli(applyArgs(first));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /权限无效/);
    });
    await p.update({
      collection: "staff",
      id: admin.user.id,
      user: keeper.user,
      data: { active: true },
    });
    admin.token = await admin.login();
    const { user } = await p.auth({
      headers: new Headers({ authorization: "JWT " + admin.token }),
    });
    assert.ok(user);
    assert.equal(
      await logoutOperation({
        collection: p.collections.staff,
        req: await createLocalReq({ user }, p),
      }),
      true,
    );
    await unchanged(async () => assert.equal((await cli(applyArgs(first))).status, 1));
    admin.token = await admin.login();
    const sevenBody = {
      ...body,
      exhibition: { ...body.exhibition!, startDate: plus(7), endDate: plus(9) },
    };
    draft = await release(sevenBody, draft.id);
    const seven = join(files, "7 day.receipt");
    assert.equal((await cli(previewArgs(seven))).status, 0);
    const appliedSeven = await cli(applyArgs(seven));
    assert.equal(appliedSeven.status, 0, appliedSeven.stderr);
    assert.match(appliedSeven.stdout, /档位：7天/);
    assert.match(appliedSeven.stdout, /本次新增：1/);
    assert.match(appliedSeven.stdout, /本次取消：1/);
    assert.equal(await count(), 2);
    const staleSource = join(files, "source.receipt");
    assert.equal((await cli(previewArgs(staleSource))).status, 0);
    await release(
      {
        ...sevenBody,
        exhibition: { ...sevenBody.exhibition, startDate: plus(8), endDate: plus(10) },
      },
      draft.id,
    );
    await unchanged(async () => assert.equal((await cli(applyArgs(staleSource))).status, 1));
    const cancelling = join(files, "cancel.receipt");
    const cancelPreview = await cli(previewArgs(cancelling));
    assert.equal(cancelPreview.status, 0, cancelPreview.stderr);
    assert.match(cancelPreview.stdout, /本档待发：0/);
    assert.match(cancelPreview.stdout, /拟取消：1/);
    const cancelled = await cli(applyArgs(cancelling));
    assert.equal(cancelled.status, 0, cancelled.stderr);
    assert.match(cancelled.stdout, /本次新增：0/);
    assert.match(cancelled.stdout, /本次取消：1/);
    assert.equal(
      (
        await p.find({
          collection: "exhibition-reminder-jobs",
          depth: 0,
          where: {
            and: [{ scope: { equals: scope } }, { "body.status": { equals: "local-held" } }],
          },
        })
      ).totalDocs,
      0,
    );
    await unchanged(async () => {
      const result = await cli(applyArgs(first));
      assert.equal(result.status, 0);
      assert.match(result.stdout, /当时新增：1/);
      assert.match(result.stdout, /当前资格未检查/);
    });
    const missingURL = new URL(url);
    missingURL.pathname = "/" + missingName;
    assert.equal(
      (await db.query("SELECT datname FROM pg_database WHERE datname=$1", [missingName])).rows
        .length,
      0,
    );
    missingWasAbsent = true;
    const unavailable = await cli(previewArgs(join(files, "missing-db.receipt")), {
      DATABASE_URL: missingURL.toString(),
    });
    assert.equal(unavailable.status, 1);
    reportSafe(unavailable, [url.password, missingName, process.env.PAYLOAD_SECRET!]);
    assert.equal(
      (await db.query("SELECT datname FROM pg_database WHERE datname=$1", [missingName])).rows
        .length,
      0,
      "Command must not auto-create a missing database",
    );
    assert.equal(
      (
        await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='exhibition_reminder_jobs' AND column_name='cli_preserve_probe'",
        )
      ).rows.length,
      1,
    );
    assert.deepEqual(readFileSync(typesFile), typesBefore);
    assert.equal(statSync(typesFile).mtimeMs, typesTime);
    assert.equal(
      existsSync(marker),
      false,
      existsSync(marker)
        ? readFileSync(marker, "utf8").slice(0, 2200)
        : "No HTTP/fetch call is allowed in CLI process",
    );
    assert.equal(
      (await db.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1", [key])).rows
        .length,
      0,
    );
    assert.equal(
      await readDay(),
      today,
      "Rebuild fictional CLI dates if acceptance crosses Shanghai midnight",
    );
    console.log(
      "PASS exhibition reminder CLI: real private JWT files, 30/7 records, two processes, replay, revocation, expiry, cancellation and no schema/mail side effects",
    );
  } finally {
    if (missingWasAbsent)
      await db.query('DROP DATABASE IF EXISTS "' + missingName + '" WITH(FORCE)');
    await db.query("DELETE FROM exhibition_reminder_jobs WHERE scope=$1", [scope]);
    assert.equal(
      (
        await p.count({
          collection: "exhibition-reminder-jobs",
          where: { scope: { equals: scope } },
        })
      ).totalDocs,
      0,
    );
    await db.query("ALTER TABLE exhibition_reminder_jobs DROP COLUMN IF EXISTS cli_preserve_probe");
    await db.query(
      "DELETE FROM audit_events WHERE entity='exhibition-reminder-jobs' AND after->>'scope'=$1",
      [scope],
    );
    for (const id of subscriptions) await p.delete({ collection: "subscriptions", id });
    for (const id of drafts) {
      await db.query("DELETE FROM content_published WHERE draft_id=$1", [id]);
      await p.delete({ collection: "content-drafts", id });
    }
    if (grant) await p.delete({ collection: "subscription-campaign-grants", id: grant });
    for (const id of people) await p.delete({ collection: "staff", id });
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
    await db.end();
    rmSync(files, { recursive: true, force: true });
  }
}
