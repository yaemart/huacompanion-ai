import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { POST as submit } from "../../src/app/(frontend)/api/subscriptions/request/route";
import {
  GET as openLink,
  POST as useLink,
} from "../../src/app/(frontend)/email-subscription/route";
import { GET as manage } from "../../src/app/(frontend)/api/subscriptions/manage/route";
import { POST as download } from "../../src/app/(frontend)/api/subscriptions/export/route";
import { POST as oneClick } from "../../src/app/(frontend)/api/subscriptions/one-click/route";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import type { MailMessage } from "../../src/server/workflow/mail";
import { publishFictionalSubscriptionPrivacy } from "../helpers/subscription-fixtures";

export async function testSubscriptionJourney(payload: Payload) {
  const savedEnv = { ...process.env };
  const settings = await payload.findGlobal({ slug: "workflow-settings" });
  const origin = new URL(process.env.APP_URL!).origin;
  const key = randomUUID();
  const password = randomUUID();
  const staff: number[] = [];
  const privacy: number[] = [];
  const ownEmails = ["zh", "en"].map((locale) => `journey-${locale}-${key}@example.invalid`);
  const json = (path: string, body: unknown, token = "") =>
    new Request(origin + path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(token ? { authorization: `JWT ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const act = (link: URL) => {
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    assert.match(token ?? "", /^[0-9a-f]{64}$/);
    return useLink(json(link.pathname + link.search, { token }));
  };
  const row = async (email: string) =>
    (await payload.find({ collection: "subscriptions", where: { email: { equals: email } } }))
      .docs[0];
  try {
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "journey-mock-only",
      WORKFLOW_MAIL_FROM: "fictional@example.invalid",
      PRIVACY_VERSION: "journey-fictional-v1",
    });
    await payload.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    for (const locale of ["zh", "en"] as const)
      privacy.push((await publishFictionalSubscriptionPrivacy(payload, locale)).id);
    const tokens: string[] = [];
    for (const role of ["admin", "operations"] as const) {
      const email = `journey-${role}-${key}@example.invalid`;
      const user = await payload.create({
        collection: "staff",
        context: { allowLocalStaffSetup: true },
        data: { name: "虚构订阅验收", email, role, active: true, password },
      });
      staff.push(user.id);
      tokens.push((await payload.login({ collection: "staff", data: { email, password } })).token!);
    }
    const report = async (topic: string, status: string, token = tokens[0]) => {
      const response = await manage(
        new Request(
          origin + "/api/subscriptions/manage?" + new URLSearchParams({ topic, status }),
          {
            headers: { authorization: `JWT ${token}` },
          },
        ),
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    const file = async (topic: string, status: string, email: string, included: boolean) => {
      const response = await download(
        json("/api/subscriptions/export", { topic, status }, tokens[0]),
      );
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
      assert.equal(bytes.toString("utf8").includes(email), included);
      const audit = (
        await payload.find({
          collection: "audit-events",
          where: { entity: { equals: "subscriptions" }, action: { equals: "csv-export" } },
          sort: "-id",
          limit: 1,
          depth: 0,
        })
      ).docs[0];
      assert.equal(audit.actor, staff[0]);
      assert.deepEqual(audit.after, {
        filters: { topic, status },
        count: Number(response.headers.get("x-export-count")),
        asOf: response.headers.get("x-export-as-of"),
        includeSensitive: false,
      });
      assert.doesNotMatch(bytes.toString("utf8"), /journey-fictional-v1|tokenHash|consentVersion/);
    };
    for (const [index, locale] of (["zh", "en"] as const).entries()) {
      const email = ownEmails[index];
      const topic = index ? "exhibition-alerts" : "sourcing-guides";
      const data = {
        email,
        topic,
        locale,
        sourcePath: `/${locale}`,
        consent: true,
        privacyVersion: process.env.PRIVACY_VERSION,
      };
      const confirmedBefore = (await report(topic, "confirmed")).total;
      assert.equal(
        (await submit(json("/api/subscriptions/request", { ...data, consent: false }))).status,
        400,
      );
      assert.equal(await row(email), undefined);
      const accepted = await submit(json("/api/subscriptions/request", data));
      assert.equal(accepted.status, 202);
      assert.doesNotMatch(await accepted.text(), /token|journey-/);
      assert.equal((await row(email)).status, "pending");
      assert.equal((await report(topic, "confirmed")).total, confirmedBefore);
      await file(topic, "confirmed", email, false);
      const messages: MailMessage[] = [];
      const send = async () =>
        runSubscriptionMail(payload, async (message) => {
          assert.equal(message.to, email);
          messages.push(message);
          return { status: "sent", providerId: "fictional-journey" };
        });
      await send();
      await send();
      assert.equal(messages.length, 1, "one confirmation mail, no duplicate worker delivery");
      const links = messages[0].text
        .match(/http:\/\/127\.0\.0\.1[^\s]+/g)!
        .map((url) => new URL(url));
      const confirmation = links.find((url) => url.searchParams.get("action") === "confirm")!;
      const unsubscribe = links.find((url) => url.searchParams.get("action") === "unsubscribe")!;
      assert.equal(confirmation.searchParams.get("lang"), locale);
      for (const link of [confirmation, unsubscribe]) {
        const read = new URL(link);
        read.hash = "";
        assert.equal(openLink(new Request(read)).status, 200);
        assert.equal(
          (await row(email)).status,
          "pending",
          "opening either link does not consume consent",
        );
      }
      assert.equal((await act(confirmation)).status, 200);
      assert.equal((await act(confirmation)).status, 400, "confirmation cannot be replayed");
      assert.equal((await report(topic, "confirmed")).total, confirmedBefore + 1);
      await file(topic, "confirmed", email, true);
      assert.equal((await row(email)).status, "confirmed");
      const preview = new URL(unsubscribe);
      preview.hash = "";
      assert.equal(openLink(new Request(preview)).status, 200);
      assert.equal(
        (await row(email)).status,
        "confirmed",
        "reading unsubscribe is not consent to leave",
      );
      if (locale === "zh") {
        assert.equal((await act(unsubscribe)).status, 200);
      } else {
        const header = messages[0].headers!;
        const link = header["List-Unsubscribe"].slice(1, -1);
        assert.equal(header["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
        for (let attempt = 0; attempt < 2; attempt++)
          assert.equal(
            (
              await oneClick(
                new Request(link, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: "List-Unsubscribe=One-Click",
                }),
              )
            ).status,
            204,
          );
      }
      assert.equal((await row(email)).status, "unsubscribed");
      assert.equal((await report(topic, "confirmed")).total, confirmedBefore);
      await file(topic, "confirmed", email, false);
      await file(topic, "unsubscribed", email, true);
      await send();
      assert.equal(messages.length, 1, "unsubscribing does not enqueue unsolicited mail");
      for (const token of ["", tokens[1]]) {
        const refused = await download(json("/api/subscriptions/export", { topic }, token));
        assert.equal(refused.status, 403);
        assert.ok(!(await refused.text()).includes(email));
      }
    }
    console.log("PASS 中英文订阅完整链路：申请、模拟确认、统计导出、网页与客户端退订、审计和权限");
  } finally {
    for (const email of ownEmails) {
      const record = await row(email);
      if (!record) continue;
      const where = { subscription: { equals: record.id } };
      await payload.delete({ collection: "subscription-mail-jobs", where });
      await payload.delete({ collection: "subscription-credentials", where });
      await payload.delete({ collection: "subscriptions", id: record.id });
    }
    for (const id of privacy) await payload.delete({ collection: "content-published", id });
    for (const id of staff) await payload.delete({ collection: "staff", id });
    await payload.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
    for (const env of Object.keys(process.env)) if (!(env in savedEnv)) delete process.env[env];
    Object.assign(process.env, savedEnv);
  }
}
