import { advanceDispatchClock } from "../helpers/dispatch-clock";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { renderToStaticMarkup } from "react-dom/server";
import { POST as requestSubscription } from "../../src/app/(frontend)/api/subscriptions/request/route";
import { POST as confirm } from "../../src/app/(frontend)/email-subscription/route";
import { PublicSubscription } from "../../src/components/content/PublicSubscription";
import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition } from "../../src/lib/exhibitions";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import type { MailMessage } from "../../src/server/workflow/mail";
import {
  fictionalSubscriptionPrivacy,
  publishFictionalSubscriptionPrivacy,
} from "../helpers/subscription-fixtures";

export async function testSubscriptionForm(payload: Payload) {
  const savedEnv = { ...process.env };
  const previous = await payload.findGlobal({ slug: "workflow-settings" });
  const email = `form-${randomUUID()}@example.invalid`;
  const origin = new URL(process.env.APP_URL!).origin;
  const sourcePath = "/zh/tools/china-visa-free-checker";
  const data = {
    email,
    locale: "zh",
    topic: "policy-updates",
    sourcePath,
    privacyVersion: "form-fixture-v1",
  };
  const privacy = fictionalSubscriptionPrivacy("en");
  const published = [privacy, fictionalSubscriptionPrivacy("zh")];
  const exhibition: ContentBody = {
    ...privacy,
    kind: "exhibition",
    slug: "sample-fair",
    contentKey: "sample-fair-key",
    title: "Sample fair",
    exhibition: { ...emptyExhibition(), status: "announced" },
  };
  const render = async (
    locale: "zh" | "en" | "fr" = "zh",
    path = sourcePath,
    contents: ContentBody[] = published,
  ) => renderToStaticMarkup(await PublicSubscription({ locale, sourcePath: path, contents }));
  const records = async () =>
    (await payload.find({ collection: "subscriptions", where: { email: { equals: email } } })).docs;
  const submit = (consent: boolean) =>
    requestSubscription(
      new Request(new URL("/api/subscriptions/request", origin), {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent, contactFax: "" }),
      }),
    );
  let privacyID: number | undefined;
  try {
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fixture-only",
      WORKFLOW_MAIL_FROM: "fictional@example.invalid",
      PRIVACY_VERSION: data.privacyVersion,
    });
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: false } });
    assert.equal(await render(), "");
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    for (const key of [
      "SUBSCRIPTIONS_ENABLED",
      "SUBSCRIPTION_REQUESTS_ENABLED",
      "SUBSCRIPTION_MAIL_LINKS_VERIFIED",
      "WORKFLOW_MAIL_ENABLED",
      "WORKFLOW_MAIL_API_KEY",
      "WORKFLOW_MAIL_FROM",
      "PRIVACY_VERSION",
      "PAYLOAD_SECRET",
    ]) {
      const value = process.env[key];
      assert.ok(value);
      delete process.env[key];
      assert.equal(await render(), "", `hide when ${key} is missing`);
      process.env[key] = value;
    }
    assert.equal(await render("fr", "/fr"), "");
    assert.equal(await render("zh", sourcePath, [privacy]), "");
    const zh = await render();
    assert.match(zh, /<form\b[^>]*method="post"/);
    assert.match(zh, /<option value="policy-updates" selected="">政策更新<\/option>/);
    assert.match(zh, /href="\/zh\/privacy"/);
    assert.match(zh, /<input[^>]+type="checkbox"[^>]+required/);
    assert.match(zh, /<button[^>]+type="submit" disabled=""/);
    assert.doesNotMatch(zh, /checked=|fixture-only/);
    const exhibitionPath = "/en/exhibitions/sample-fair";
    const en = await render("en", exhibitionPath, [privacy, exhibition]);
    assert.match(
      en,
      /<option value="exhibition:sample-fair-key" selected="">Sample fair<\/option>/,
    );
    assert.match(en, /href="\/en\/privacy"/);
    assert.doesNotMatch(
      await render("en", exhibitionPath, [privacy]),
      /exhibition:sample-fair-key/,
    );
    const appEnv = process.env.APP_ENV;
    const appURL = process.env.APP_URL;
    try {
      process.env.APP_ENV = "production";
      process.env.APP_URL = "https://fictional-subscription.invalid";
      assert.equal(await render("en", "/en", [privacy]), "", "require the trusted gateway");
      process.env.TRUSTED_PROXY = "nginx";
      process.env.TRUSTED_PROXY_SECRET = "fixture-long-secret-for-nginx-gateway";
      assert.equal(await render("en", "/en", []), "", "hide without a published privacy notice");
      assert.match(await render("en", "/en", [privacy]), /Privacy notice/);
      process.env.APP_ENV = "fixture-unknown";
      assert.equal(
        await render("en", "/en", [privacy]),
        "",
        "no sender in unsupported environments",
      );
    } finally {
      process.env.APP_ENV = appEnv;
      process.env.APP_URL = appURL;
      delete process.env.TRUSTED_PROXY;
      delete process.env.TRUSTED_PROXY_SECRET;
    }

    assert.equal((await submit(false)).status, 400);
    assert.equal((await records()).length, 0);
    assert.equal((await submit(true)).status, 503, "requiring privacy is enforced on POST");
    assert.equal((await records()).length, 0);
    privacyID = (await publishFictionalSubscriptionPrivacy(payload, "zh")).id;
    assert.equal((await submit(true)).status, 202);
    assert.equal((await records())[0].status, "pending");
    const messages: MailMessage[] = [];
    await advanceDispatchClock(payload);
    await runSubscriptionMail(payload, async (message) => {
      messages.push(message);
      return { status: "sent", providerId: "mock-confirmation" };
    });
    assert.equal(messages.length, 1);
    const link = new URL(messages[0].text.split("\n")[0].slice("确认订阅：".length));
    assert.equal(link.origin, origin);
    assert.equal(link.searchParams.get("lang"), "zh");
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    assert.ok(token);
    link.hash = "";
    const reply = await confirm(
      new Request(link, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    assert.equal(reply.status, 200);
    const [record] = await records();
    assert.equal(record.status, "confirmed");
    assert.equal(record.topic, "policy-updates");
    assert.equal(record.sourcePath, sourcePath);
    assert.equal(record.privacyVersion, data.privacyVersion);
    console.log("PASS 双语订阅表单、配置门禁、明确同意与模拟邮件确认");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    if (privacyID !== undefined)
      await payload.delete({ collection: "content-published", id: privacyID });
    await payload.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: previous.emailEnabled },
    });
    for (const record of await records()) {
      const where = { subscription: { equals: record.id } };
      await payload.delete({ collection: "subscription-mail-jobs", where });
      await payload.delete({ collection: "subscription-credentials", where });
      await payload.delete({ collection: "subscriptions", id: record.id });
    }
  }
}
