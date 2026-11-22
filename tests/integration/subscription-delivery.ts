import { advanceDispatchClock } from "../helpers/dispatch-clock";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import pg from "pg";
import { POST } from "../../src/app/(frontend)/api/subscriptions/one-click/route";
import { POST as confirm } from "../../src/app/(frontend)/email-subscription/route";
import { down, up } from "../../src/migrations/20261118_090000_subscription_delivery";
import { proxy } from "../../src/proxy";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import { queueSubscription } from "../../src/server/subscriptions";
import { sendConfiguredMail } from "../../src/server/workflow/mail";

export async function testSubscriptionDelivery(payload: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const previous = await payload.findGlobal({ slug: "workflow-settings" });
  const priorEnv = { ...process.env };
  const origin = "https://fictional-mail.invalid";
  const email = `delivery-${randomUUID()}@example.invalid`;
  const input = {
    email,
    locale: "en",
    topic: "policy-updates",
    sourcePath: "/en",
    privacyVersion: "fixture-v1",
  };
  const calls: { body: string; key: string | null }[] = [];
  const mockFetch: typeof fetch = async (target, init) => {
    assert.equal(target, "https://api.resend.com/emails");
    calls.push({
      body: String(init?.body),
      key: new Headers(init?.headers).get("Idempotency-Key"),
    });
    if (calls.length === 1) throw Error("fixture loses its response");
    if (calls.length === 2)
      return new Response(null, { status: 429, headers: { "Retry-After": "1800" } });
    return Response.json({ id: "mock-accepted" });
  };
  const run = async () => {
    await advanceDispatchClock(payload);
    return runSubscriptionMail(payload, (message) =>
      sendConfiguredMail(message, { fetch: mockFetch }),
    );
  };
  const jobs = async () =>
    (
      await db.query(
        `SELECT j.* FROM subscription_mail_jobs j JOIN subscriptions s ON s.id=j.subscription_id
       WHERE s.email=$1 ORDER BY j.id`,
        [email],
      )
    ).rows;
  const ageAttempts = async () => {
    await db.query(
      `UPDATE subscription_mail_jobs SET attempted_at=(
        SELECT jsonb_agg(now()-interval '16 minutes') FROM jsonb_array_elements(attempted_at)
      ), next_at=now()-interval '1 minute' WHERE id=$1`,
      [(await jobs())[0].id],
    );
  };
  try {
    Object.assign(process.env, {
      APP_URL: origin,
      APP_ENV: "local",
      PRIVACY_VERSION: "fixture-v1",
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "false",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fixture-only",
      WORKFLOW_MAIL_FROM: "fictional-sender@example.invalid",
      TRIAL_ACCESS_REQUIRED: "true",
      TRIAL_ACCESS_USER: "fictional-preview",
      TRIAL_ACCESS_PASSWORD: "fictional-password-for-this-fixture",
      TRIAL_MAINTENANCE: "false",
    });
    const path = (pathname: string, method: string) =>
      proxy(new NextRequest(origin + pathname, { method })).status;
    assert.equal(path("/api/subscriptions/one-click", "POST"), 401);
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    await queueSubscription(payload, input, origin);
    const migrationDB = { db: { execute: (statement: string) => db.query(statement) } };
    const before = await jobs();
    await db.query("BEGIN");
    try {
      await down(migrationDB as unknown as MigrateDownArgs);
      await up(migrationDB as unknown as MigrateUpArgs);
      assert.deepEqual(await jobs(), before, "queued legacy mail is preserved");
    } finally {
      await db.query("ROLLBACK");
    }
    await run();
    assert.equal(calls.length, 0);
    process.env.SUBSCRIPTION_MAIL_LINKS_VERIFIED = "true";
    assert.equal(path("/email-subscription", "GET"), 200);
    assert.equal(path("/email-subscription", "POST"), 200);
    assert.equal(path("/api/subscriptions/one-click", "POST"), 200);
    assert.equal(path("/api/subscriptions/one-click", "GET"), 401);
    assert.equal(path("/api/subscriptions/request", "POST"), 401);
    process.env.TRIAL_MAINTENANCE = "true";
    assert.equal(path("/api/subscriptions/one-click", "POST"), 503);
    assert.equal(path("/email-subscription", "GET"), 503);
    await run();
    assert.equal(calls.length, 0);
    process.env.TRIAL_MAINTENANCE = "false";
    const fetchBefore = globalThis.fetch;
    let unexpectedRequests = 0;
    globalThis.fetch = async () => {
      unexpectedRequests++;
      throw Error("Real email is disabled for this test");
    };
    try {
      await runSubscriptionMail(payload);
      assert.equal(unexpectedRequests, 0);
      assert.equal((await jobs())[0].status, "queued");
    } finally {
      globalThis.fetch = fetchBefore;
    }
    await Promise.all([run(), run()]);
    assert.equal(calls.length, 1);
    assert.equal((await jobs())[0].status, "uncertain");
    await db.query(
      "UPDATE subscription_mail_jobs SET next_at=now()-interval '1 minute' WHERE id=$1",
      [(await jobs())[0].id],
    );
    await run();
    assert.equal(calls.length, 1);
    await ageAttempts();
    await run();
    assert.deepEqual(calls[0], calls[1], "retry uses the identical mail and key");
    const throttled = (await jobs())[0];
    assert.equal(throttled.status, "retry");
    assert.ok(Date.parse(throttled.next_at) - Date.now() > 29 * 60000);
    await db.query(
      "UPDATE subscription_mail_jobs SET status='running', lease='expired-fixture-lease' WHERE id=$1",
      [throttled.id],
    );
    await ageAttempts();
    await run();
    assert.deepEqual(calls[0], calls[2], "an interrupted worker preserves mail and key");
    assert.equal((await jobs())[0].status, "sent");
    await db.query("BEGIN");
    try {
      await assert.rejects(down(migrationDB as unknown as MigrateDownArgs), /delivery history/);
    } finally {
      await db.query("ROLLBACK");
    }

    const message = JSON.parse(calls[2].body);
    assert.deepEqual(message.to, [email]);
    assert.match(message.text, /Topic: Policy updates/);
    assert.match(
      message.text,
      /https:\/\/fictional-mail\.invalid\/email-subscription\?action=confirm/,
    );
    assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    const link = message.headers["List-Unsubscribe"].slice(1, -1);
    const unsubscribe = (body: FormData | URLSearchParams) =>
      POST(new Request(link, { method: "POST", body }));
    const marker = new URLSearchParams({ "List-Unsubscribe": "One-Click" });
    const find = async () =>
      (
        await payload.find({
          collection: "subscriptions",
          where: { email: { equals: email }, topic: { equals: input.topic } },
          limit: 1,
        })
      ).docs[0];
    assert.equal((await find()).status, "pending");
    const confirmation = new URL(message.text.split("\n")[0].slice("Confirm: ".length));
    const token = new URLSearchParams(confirmation.hash.slice(1)).get("token");
    confirmation.hash = "";
    const confirmed = await confirm(
      new Request(confirmation, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    assert.equal(confirmed.status, 200);
    assert.equal((await find()).status, "confirmed");
    const invalid = new URLSearchParams({ "List-Unsubscribe": "Other" });
    assert.equal((await unsubscribe(invalid)).status, 400);
    assert.equal((await find()).status, "confirmed");
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    process.env.SUBSCRIPTION_REQUESTS_ENABLED = "false";
    assert.equal((await unsubscribe(form)).status, 204);
    assert.equal((await find()).status, "unsubscribed");
    process.env.SUBSCRIPTION_REQUESTS_ENABLED = "true";
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at=now()-interval '16 minutes' WHERE id=$1",
      [(await jobs())[0].id],
    );
    await queueSubscription(payload, input, origin);
    assert.equal((await unsubscribe(marker)).status, 204);
    assert.equal((await find()).status, "pending");
    await run();
    assert.equal(calls.length, 3, "same mailbox cap includes earlier delivery attempts");
    await db.query(
      `UPDATE subscription_mail_jobs SET attempted_at=(
        SELECT jsonb_agg(now()-n*interval '1 hour') FROM generate_series(1,5) AS n
      ) WHERE id=$1`,
      [(await jobs())[0].id],
    );
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at=now()-interval '16 minutes', next_at=NULL WHERE id=$1",
      [(await jobs())[1].id],
    );
    const otherTopic = "exhibition-alerts";
    await queueSubscription(payload, { ...input, topic: otherTopic, locale: "zh" }, origin);
    assert.equal((await jobs()).length, 3);
    await run();
    assert.equal(calls.length, 3, "rolling daily cap applies across topics");
    const [delivered, stale, other] = await jobs();
    await db.query(
      "UPDATE subscription_mail_jobs SET attempted_at=jsonb_build_array(now()-interval '25 hours') WHERE id=$1",
      [delivered.id],
    );
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at=now()-interval '24 hours', next_at=NULL WHERE id=$1",
      [stale.id],
    );
    await db.query("UPDATE subscription_mail_jobs SET next_at=NULL WHERE id=$1", [other.id]);
    await run();
    assert.equal(calls.length, 4, "sending resumes after the daily window");
    assert.equal((await jobs())[1].status, "cancelled");
    assert.match(JSON.parse(calls[3].body).text, /订阅主题：展会提醒/);
    console.log("PASS 单封确认邮件、中断恢复、发送限流和客户端一键退订");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key];
    Object.assign(process.env, priorEnv);
    await payload.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: previous.emailEnabled },
    });
    await db.query(
      "DELETE FROM subscription_mail_jobs WHERE subscription_id IN (SELECT id FROM subscriptions WHERE email=$1)",
      [email],
    );
    await db.query(
      "DELETE FROM subscription_credentials WHERE subscription_id IN (SELECT id FROM subscriptions WHERE email=$1)",
      [email],
    );
    await db.query("DELETE FROM subscriptions WHERE email=$1", [email]);
    await db.end();
  }
}
