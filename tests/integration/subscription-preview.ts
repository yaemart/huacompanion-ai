import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { getPayload } from "payload";
import pg from "pg";
import { emptyExhibition } from "../../src/lib/exhibitions";
import config from "../../src/payload.config";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import { publishFictionalSubscriptionPrivacy } from "../helpers/subscription-fixtures";
import { publishFictionalMailPolicies } from "../helpers/policy-email-fixtures";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55442");
assert.equal(url.username, "hua_demo");
assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
assert.ok(!url.search && !url.hash);
assert.equal(process.env.APP_ENV, "local");
assert.equal(process.env.APP_URL, "http://127.0.0.1:3186");
assert.equal(process.env.WORKFLOW_MAIL_API_KEY, "fictional-preview-only");
assert.equal(process.env.HUA_DEMO_SCHEMA_PUSH, "false");
assert.ok(process.send);

const payload = await getPayload({ config });
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
let stopped = false;
const stop = () => {
  stopped = true;
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.once("disconnect", stop);
try {
  await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
  for (const locale of ["zh", "en"] as const) {
    await publishFictionalSubscriptionPrivacy(payload, locale);
    await publishFictionalMailPolicies(payload, locale);
    await payload.create({
      collection: "content-published",
      data: {
        active: true,
        draftId: locale === "en" ? -21 : -22,
        routeKey: `exhibition:${locale}:fictional-fair`,
        revision: 1,
        body: {
          kind: "exhibition",
          locale,
          contentKey: "fictional-fair",
          slug: "fictional-fair",
          title: locale === "en" ? "Fictional preview fair" : "虚构演示展会",
          summary: locale === "en" ? "Sample content for local testing." : "仅供本机测试。",
          exhibition: { ...emptyExhibition(), status: "announced" },
          blocks: [],
          sources: [],
        },
        publishedBy: 1,
        publishedAt: new Date().toISOString(),
      },
    });
  }
  process.send("ready");
  while (!stopped) {
    // Only this throwaway preview advances the wait between its two mock mails.
    await db.query(`
      UPDATE subscription_mail_jobs request SET attempted_at=jsonb_build_array(now()-interval '16 minutes')
      WHERE NOT request.deliver_policy AND request.policy_selection IS NOT NULL
        AND EXISTS (SELECT 1 FROM subscription_mail_jobs material
          WHERE material.key='policy-material:' || request.key AND material.status='queued')
    `);
    await runSubscriptionMail(payload, async ({ to, text, idempotencyKey }) => {
      if (!to.endsWith("@example.invalid")) return { status: "failed" };
      if (idempotencyKey.startsWith("policy-material:")) {
        console.log(`[模拟政策资料邮件] ${to}\n${text}\n[模拟邮件结束]`);
        return { status: "sent", providerId: "fictional-preview" };
      }
      const link = text.split("\n")[0].match(/http:\/\/127\.0\.0\.1:3186\/\S+$/)?.[0];
      assert.ok(link);
      console.log(`[模拟确认链接] ${to} ${link}`);
      return { status: "sent", providerId: "fictional-preview" };
    });
    await setTimeout(1000);
  }
} finally {
  try {
    await db.end();
    await payload.destroy();
  } finally {
    if (process.connected) process.disconnect();
  }
}
// The PostgreSQL adapter keeps a reconnect client checked out for the process lifetime.
process.exit(0);
