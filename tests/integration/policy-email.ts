import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";
import { POST as requestSubscription } from "../../src/app/(frontend)/api/subscriptions/request/route";
import {
  GET,
  POST as confirmSubscription,
} from "../../src/app/(frontend)/email-subscription/route";
import { policyMailReference } from "../../src/server/policy-subscription";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import { down } from "../../src/migrations/20261118_130000_policy_subscription_mail";
import type { MailMessage } from "../../src/server/workflow/mail";
import {
  otherPolicy as previewOtherPolicy,
  publishFictionalSharedMailPolicy,
  selectedPolicy as previewSelectedPolicy,
} from "../helpers/policy-email-fixtures";
import { publishFictionalSubscriptionPrivacy } from "../helpers/subscription-fixtures";

export async function testPolicyEmail(payload: Payload, dbURL: URL) {
  const saved = { ...process.env };
  const previous = await payload.findGlobal({ slug: "workflow-settings" });
  const db = new pg.Client({ connectionString: dbURL.toString() });
  await db.connect();
  const fixtures: number[] = [];
  const selectedPolicy = { ...previewSelectedPolicy, countryCode: "DE" };
  const otherPolicy = { ...previewOtherPolicy, countryCode: "DE" };
  const emails = [0, 1, 2].map(() => `policy-${randomUUID()}@example.invalid`);
  const origin = "http://127.0.0.1:3186";
  const prefix = "/zh/tools/china-visa-free-checker";
  const base = {
    email: emails[0],
    locale: "zh",
    topic: "policy-updates",
    privacyVersion: "policy-fixture",
    sourcePath: prefix,
    policyReference: policyMailReference("zh", selectedPolicy),
    consent: true,
    contactFax: "",
  };
  const submit = (patch: Record<string, unknown> = {}) =>
    requestSubscription(
      new Request(origin + "/api/subscriptions/request", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, ...patch }),
      }),
    );
  const mail: MailMessage[] = [];
  const run = () =>
    runSubscriptionMail(payload, async (message) => {
      if (message.idempotencyKey.startsWith("policy-material:")) {
        const lock = await db.query("SELECT pg_try_advisory_xact_lock(726271) AS acquired");
        assert.equal(lock.rows[0].acquired, false, "publication stays locked through dispatch");
      }
      mail.push(message);
      return { status: "sent", providerId: "fixture-policy-mail" };
    });
  const confirm = (message: MailMessage) => {
    const href = message.text.split("\n")[0].match(/http:\/\/127\.0\.0\.1:3186\S+$/)?.[0];
    assert.ok(href);
    const url = new URL(href);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    url.hash = "";
    assert.equal(GET(new Request(url)).status, 200);
    return confirmSubscription(
      new Request(url, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
  };
  const jobs = async (email: string) =>
    (
      await db.query(
        `SELECT j.* FROM subscription_mail_jobs j JOIN subscriptions s ON j.subscription_id=s.id
       WHERE s.email=$1 ORDER BY j.id`,
        [email],
      )
    ).rows;
  const age = async (email: string) =>
    db.query(
      `UPDATE subscription_mail_jobs j SET created_at=now()-interval '16 minutes', next_at=NULL,
        attempted_at=CASE WHEN attempted_at IS NULL THEN NULL ELSE jsonb_build_array(now()-interval '16 minutes') END
       FROM subscriptions s WHERE j.subscription_id=s.id AND s.email=$1`,
      [email],
    );
  try {
    Object.assign(process.env, {
      APP_URL: origin,
      APP_ENV: "local",
      VISA_CHECKER_ENABLED: "true",
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fixture-only",
      WORKFLOW_MAIL_FROM: "fixture@example.invalid",
      PRIVACY_VERSION: base.privacyVersion,
    });
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    fixtures.push((await publishFictionalSubscriptionPrivacy(payload, "zh")).id);
    // The runner drops this dedicated database; immutable versions use normal publication guards.
    await publishFictionalSharedMailPolicy(payload, selectedPolicy);
    const other = await publishFictionalSharedMailPolicy(payload, otherPolicy);
    assert.equal((await submit({ consent: false })).status, 400);
    assert.equal((await submit({ nationalityISO: "DE", arrivalDate: "2026-12-15" })).status, 400);
    assert.equal(
      (await submit({ policyReference: policyMailReference("en", selectedPolicy) })).status,
      400,
    );
    assert.equal((await submit({ sourcePath: "/zh" })).status, 400);
    assert.equal((await jobs(base.email)).length, 0);
    assert.equal((await submit()).status, 202);
    await run();
    assert.equal(mail.length, 1);
    assert.doesNotMatch(mail[0].text, /fictional-selected|Fictional port|2026-12-15/);
    assert.equal((await jobs(base.email)).length, 1);
    assert.deepEqual((await jobs(base.email))[0].policy_selection, {
      reference: base.policyReference,
      locale: base.locale,
      privacyVersion: base.privacyVersion,
    });
    const results = await Promise.all([confirm(mail[0]), confirm(mail[0])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal((await jobs(base.email)).length, 2);
    await db.query("BEGIN");
    try {
      await assert.rejects(
        down({
          db: { execute: (statement: string) => db.query(statement) },
        } as unknown as MigrateDownArgs),
        /Preserve policy mail requests/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
    await run();
    assert.equal(mail.length, 1, "material mail observes the same mailbox cooldown");
    await age(base.email);
    await run();
    assert.equal(mail.length, 2);
    assert.match(mail[1].text, /fictional-selected/);
    assert.match(mail[1].text, /2026-11-01/);
    assert.doesNotMatch(mail[1].text, /fictional-unselected|TEST PRIVATE|2026-12-15/);
    assert.equal(mail[1].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    await age(base.email);
    assert.equal(
      (await submit({ policyReference: policyMailReference("zh", otherPolicy) })).status,
      202,
    );
    await run();
    assert.equal(mail.length, 3, "an already subscribed address still gets a scoped confirmation");
    assert.equal((await confirm(mail[2])).status, 200);
    await payload.update({
      collection: "policy-groups",
      id: other.group,
      data: { activeFactVersion: null },
    });
    await age(base.email);
    await run();
    assert.equal(mail.length, 3, "a withdrawn selection cannot be delivered");
    assert.equal((await jobs(base.email)).at(-1).status, "cancelled");
    assert.equal(
      (await submit({ email: emails[1], policyReference: policyMailReference("zh", otherPolicy) }))
        .status,
      400,
    );
    await payload.update({
      collection: "policy-groups",
      id: other.group,
      data: { activeFactVersion: other.fact },
    });
    const email = emails[2];
    assert.equal((await submit({ email })).status, 202);
    await run();
    await age(email);
    assert.equal(
      (await submit({ email, policyReference: policyMailReference("zh", otherPolicy) })).status,
      202,
    );
    await run();
    assert.equal(mail.length, 5);
    assert.equal(
      (await confirm(mail[3])).status,
      200,
      "a second selection preserves the first pending token",
    );
    assert.equal((await confirm(mail[4])).status, 200);
    await age(email);
    await db.query(
      `
        UPDATE subscription_mail_jobs j SET created_at=now()-interval '25 hours'-
          CASE WHEN j.policy_selection->>'reference'=$2 THEN interval '1 minute' ELSE interval '0' END FROM subscriptions s
      WHERE j.subscription_id=s.id AND s.email=$1 AND j.deliver_policy
    `,
      [email, base.policyReference],
    );
    await run();
    assert.equal(
      mail.length,
      6,
      "a material delayed past 23 hours can still make its first attempt",
    );
    assert.match(mail[5].text, /fictional-selected/);
    const pendingMaterial = (await jobs(email)).filter(
      (job) => job.deliver_policy && job.status === "queued",
    );
    assert.equal(pendingMaterial.length, 1, "later selected materials still obey the send quota");
    console.log("PASS 免签所选资料、独立确认、发送限额、下架拦截和隐私");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    for (const id of fixtures) await payload.delete({ collection: "content-published", id });
    await payload.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: previous.emailEnabled },
    });
    for (const table of ["subscription-mail-jobs", "subscription-credentials"] as const) {
      const rows = await payload.find({
        collection: "subscriptions",
        where: { email: { in: emails } },
      });
      for (const row of rows.docs)
        await payload.delete({ collection: table, where: { subscription: { equals: row.id } } });
    }
    await payload.delete({ collection: "subscriptions", where: { email: { in: emails } } });
    await db.end();
  }
}
