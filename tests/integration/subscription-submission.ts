import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { handleEndpoints } from "payload";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { POST } from "../../src/app/(frontend)/api/subscriptions/request/route";
import config from "../../src/payload.config";
import { emptyExhibition } from "../../src/lib/exhibitions";
import { intakeClient } from "../../src/server/intake-client";
import { intakeAllowed } from "../../src/server/rate-limit";
import { down } from "../../src/migrations/20261117_210000_subscription_mail_queue";

export async function testSubscriptionSubmission(payload: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const settings = await payload.findGlobal({ slug: "workflow-settings" });
  const originalFetch = globalThis.fetch;
  const originalEnvironment = { ...process.env };
  const email = `submission-${randomUUID()}@example.invalid`;
  const origin = new URL(process.env.APP_URL!).origin;
  const input = {
    email,
    topic: "policy-updates",
    locale: "en",
    sourcePath: "/en/tools/visa-checker",
    consent: true,
    privacyVersion: "fictional-v1",
    contactFax: "",
  };
  const submit = (
    patch: Record<string, unknown> = {},
    requestOrigin = origin,
    cookie = "",
    headers: Record<string, string> = {},
  ) =>
    POST(
      new Request(`${origin}/api/subscriptions/request`, {
        method: "POST",
        headers: { origin: requestOrigin, "content-type": "application/json", cookie, ...headers },
        body: JSON.stringify({ ...input, ...patch }),
      }),
    );
  const records = async () =>
    (await payload.find({ collection: "subscriptions", where: { email: { equals: email } } })).docs;
  const jobs = async () => {
    const ids = (await records()).map(({ id }) => id);
    return ids.length
      ? (
          await payload.find({
            collection: "subscription-mail-jobs",
            where: { subscription: { in: ids } },
            depth: 0,
          })
        ).docs
      : [];
  };
  let outgoing = 0;
  let exhibitionID: number | undefined;
  try {
    globalThis.fetch = async () => {
      outgoing++;
      throw Error("No network mail or HTTP in subscription intake test");
    };
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "false",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "false",
      PRIVACY_VERSION: "fictional-v1",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fixture-only-no-network",
      WORKFLOW_MAIL_FROM: "fixture@example.invalid",
    });
    assert.equal((await submit()).status, 503);
    assert.equal((await jobs()).length, 0);
    process.env.SUBSCRIPTION_REQUESTS_ENABLED = "true";
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    assert.equal((await submit()).status, 503);
    assert.equal((await jobs()).length, 0);
    process.env.SUBSCRIPTION_MAIL_LINKS_VERIFIED = "true";
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: false } });
    assert.equal((await submit()).status, 503);
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    assert.equal((await submit({}, "https://external.invalid")).status, 403);
    assert.equal((await submit({ consent: false })).status, 400);
    assert.equal((await submit({ privacyVersion: "obsolete-version" })).status, 400);
    assert.equal((await submit({ topic: "exhibition:not-published" })).status, 400);
    assert.equal((await jobs()).length, 0);

    const trapped = await submit({ contactFax: "robot-input" });
    assert.equal(trapped.status, 202);
    const uniform = await trapped.text();
    assert.equal((await records()).length, 0);
    await db.query(
      "ALTER TABLE subscription_mail_jobs ADD CONSTRAINT reject_fixture_job CHECK (false) NOT VALID",
    );
    try {
      assert.equal((await submit()).status, 503);
      assert.equal((await records()).length, 0);
    } finally {
      await db.query("ALTER TABLE subscription_mail_jobs DROP CONSTRAINT reject_fixture_job");
    }
    await db.query(`
      CREATE FUNCTION reject_fixture_commit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fixture rejects queue commit'; END $$;
      CREATE CONSTRAINT TRIGGER reject_fixture_commit AFTER INSERT ON subscription_mail_jobs
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_fixture_commit();
    `);
    try {
      assert.equal((await submit()).status, 503);
      assert.equal((await jobs()).length, 0);
      assert.equal((await records()).length, 0);
    } finally {
      await db.query(`
        DROP TRIGGER reject_fixture_commit ON subscription_mail_jobs;
        DROP FUNCTION reject_fixture_commit();
      `);
    }
    const simultaneous = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        submit({
          email: i === 0 ? email.toUpperCase() : email,
          topic: i % 2 ? "exhibition-alerts" : input.topic,
        }),
      ),
    );
    for (const response of simultaneous) {
      assert.equal(response.status, 202);
      assert.equal(await response.text(), uniform);
    }
    const cookie = simultaneous[0].headers.get("set-cookie");
    assert.ok(cookie);
    assert.match(cookie, /^hua_subscription_client=/);
    assert.match(cookie, /Path=\/api\/subscriptions\/request/);
    const [first] = await jobs();
    assert.ok(first);
    assert.equal((await jobs()).length, 1);
    const [record] = await records();
    assert.equal(record.status, "pending");
    assert.equal(record.email, email);
    assert.equal(record.privacyVersion, input.privacyVersion);
    assert.equal(first.consentVersion, record.consentVersion);
    assert.ok(!JSON.stringify(first).includes(email));
    const privateQueue = await handleEndpoints({
      config,
      request: new Request(`${origin}/api/subscription-mail-jobs/${first.id}`),
    });
    assert.equal(privateQueue.status, 501);
    assert.ok(!(await privateQueue.text()).includes(first.key));
    await assert.rejects(
      payload.find({ collection: "subscription-mail-jobs", overrideAccess: false }),
      { status: 403 },
    );
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down({ db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateDownArgs),
        /Preserve subscription mail requests before rollback/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    const anonymous = await payload.find({
      collection: "subscription-credentials",
      where: { subscription: { equals: record.id } },
    });
    assert.equal(
      anonymous.totalDocs,
      0,
      "Intake must leave credential issuance to the mail worker",
    );

    for (let n = 2; n <= 5; n++) {
      await db.query(
        "UPDATE subscription_mail_jobs SET created_at = now() - interval '16 minutes' WHERE id = ANY($1::int[])",
        [(await jobs()).map(({ id }) => id)],
      );
      assert.equal((await submit()).status, 202);
      assert.equal((await jobs()).length, n);
    }
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at = now() - interval '16 minutes' WHERE id = ANY($1::int[])",
      [(await jobs()).map(({ id }) => id)],
    );
    const capped = await submit({ topic: "sourcing-guides" });
    assert.equal(capped.status, 202);
    assert.equal(await capped.text(), uniform);
    assert.equal((await jobs()).length, 5);
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at = now() - interval '25 hours' WHERE id = ANY($1::int[])",
      [(await jobs()).map(({ id }) => id)],
    );
    assert.equal((await submit({ topic: "sourcing-guides" })).status, 202);
    assert.equal((await jobs()).length, 6);

    const cookiePair = cookie.split(";")[0];
    const { key } = intakeClient(
      new Request(origin, { headers: { cookie: cookiePair } }),
      process.env,
      "subscriptions",
    );
    const bucket = Math.floor(Date.now() / 600000);
    // The capped subscription browser cannot spend the existing inquiry quota.
    await db.query(
      `INSERT INTO intake_limits (bucket, client_key, count) VALUES ($1, $2, 60), ($1 + 1, $2, 60)
       ON CONFLICT (bucket, client_key) DO UPDATE SET count = 60`,
      [bucket, `subscriptions:${key}`],
    );
    assert.equal((await submit({}, origin, cookiePair)).status, 429);
    assert.equal(await intakeAllowed(key), true);

    const keyOfExhibition = "fixture-" + randomUUID();
    const published = await payload.create({
      collection: "content-published",
      data: {
        active: true,
        draftId: -Date.now(),
        routeKey: `exhibition:en:different-${keyOfExhibition}`,
        revision: 1,
        body: {
          kind: "exhibition",
          locale: "en",
          contentKey: keyOfExhibition,
          slug: "different-" + keyOfExhibition,
          title: "Fictional exhibition",
          exhibition: emptyExhibition(),
          blocks: [],
          sources: [],
        },
        publishedBy: 1,
        publishedAt: new Date().toISOString(),
      },
    });
    exhibitionID = published.id;
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at = now() - interval '16 minutes' WHERE id = $1",
      [
        (await jobs()).find(
          (job) => job.siteOrigin === origin && Date.parse(job.createdAt) > Date.now() - 3600000,
        )?.id,
      ],
    );
    const trialOrigin = "https://fictional-subscription.invalid";
    process.env.APP_ENV = "trial";
    process.env.APP_URL = trialOrigin;
    assert.equal((await submit({}, trialOrigin)).status, 503);
    process.env.TRUSTED_PROXY = "nginx";
    process.env.TRUSTED_PROXY_SECRET = "fixture-subscription-gateway-not-a-real-secret";
    assert.equal((await submit({}, trialOrigin)).status, 503);
    const accepted = await submit({ topic: "exhibition:" + keyOfExhibition }, trialOrigin, "", {
      "X-Hua-Proxy-Secret": process.env.TRUSTED_PROXY_SECRET,
      "X-Real-IP": "192.0.2.80",
    });
    assert.equal(accepted.status, 202);
    assert.ok((await records()).some((row) => row.topic === "exhibition:" + keyOfExhibition));
    assert.equal(outgoing, 0);
    console.log("PASS 公开提交、模拟邮件队列、同邮箱 15 分钟冷却与滚动 24 小时 5 封上限");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env))
      if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
    if (exhibitionID !== undefined)
      await payload.delete({ collection: "content-published", id: exhibitionID });
    await payload.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
    for (const row of await records()) {
      await payload.delete({
        collection: "subscription-mail-jobs",
        where: { subscription: { equals: row.id } },
      });
      await payload.delete({ collection: "subscriptions", id: row.id });
    }
    await db.end();
  }
}
