import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
import pg from "pg";
import type { Payload } from "payload";
import type { Staff } from "../../payload-types";
import type { ContentBody } from "../../src/lib/content-model";
import { mutateContent } from "../../src/server/content/service";
import { databaseFingerprints } from "./database-fingerprints";
import { publishFictionalSubscriptionPrivacy } from "./subscription-fixtures";

/** Invoked only after the existing exhibition entry point's disposable-database guard. */
export async function assertExhibitionSubscriptionHTTP(
  p: Payload,
  admin: Staff,
  fixture: ContentBody,
) {
  const base = "http://127.0.0.1:3189";
  const prefix = "expo-sub-http-" + randomUUID();
  const ids: number[] = [];
  const privacy: number[] = [];
  const emails: string[] = [];
  const settings = await p.findGlobal({ slug: "workflow-settings" });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  let server: ChildProcess | undefined;
  const stop = async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    server = undefined;
  };
  const start = async (enabled: boolean) => {
    await new Promise<void>((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(3189, "127.0.0.1", () => probe.close(() => resolve()));
    });
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3189"],
      {
        env: {
          ...process.env,
          APP_ENV: "local",
          APP_URL: base,
          HUA_DEMO_SCHEMA_PUSH: "false",
          DOTENV_CONFIG_PATH: "/dev/null",
          SITE_LOCALES: "en,zh,fr",
          SUBSCRIPTIONS_ENABLED: "true",
          SUBSCRIPTION_REQUESTS_ENABLED: String(enabled),
          SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
          WORKFLOW_MAIL_ENABLED: "true",
          WORKFLOW_MAIL_API_KEY: "fictional-http-no-worker",
          WORKFLOW_MAIL_FROM: "fictional@example.invalid",
          PRIVACY_VERSION: "fictional-http-v1",
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let errors = "";
    server.stderr?.on("data", (chunk) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw Error("Fixture HTTP process exited: " + errors);
      try {
        if ((await fetch(base + "/zh")).status === 200) return;
      } catch {}
      await delay(100);
    }
    throw Error("Fixture HTTP process did not become ready");
  };
  const release = async (body: ContentBody, id?: number) => {
    const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
    let d = await mutateContent(p, admin, {
      action: "save",
      body,
      id,
      revision: current?.revision,
    });
    if (!id) ids.push(d.id);
    d = await mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
    return mutateContent(p, admin, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      exhibitionReviewed: true,
      overrideReason: "Fictional subscription HTTP review",
    });
  };
  const body: ContentBody = {
    ...fixture,
    locale: "zh",
    contentKey: prefix,
    slug: prefix,
    title: "Fictional subscribed <fair> & edition",
    exhibition: { ...fixture.exhibition!, phases: [], nextEditionKey: "" },
  };
  const html = async (path: string, status = 200) => {
    const response = await fetch(base + path, { cache: "no-store" });
    assert.equal(response.status, status);
    return response.text();
  };
  const section = (text: string) =>
    text.match(/<section class="subscription-panel"[^]*?<\/section>/)?.[0] ?? "";
  const readOnly = async (work: () => Promise<void>) => {
    const before = await databaseFingerprints(db);
    await work();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  const submit = async (patch: Record<string, unknown> = {}, status = 202) => {
    const email = `http-${emails.length}-${prefix}@example.invalid`;
    emails.push(email);
    const response = await fetch(base + "/api/subscriptions/request", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        email,
        topic: "exhibition:" + prefix,
        exhibitionKey: prefix,
        locale: "zh",
        sourcePath: "/zh/exhibitions/" + prefix,
        privacyVersion: "fictional-http-v1",
        consent: true,
        contactFax: "",
        ...patch,
      }),
    });
    assert.equal(response.status, status);
    return email;
  };
  try {
    await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    for (const locale of ["zh", "en"] as const)
      privacy.push((await publishFictionalSubscriptionPrivacy(p, locale)).id);
    let draft = await release(body);
    await release({ ...body, locale: "en" });
    await release({ ...body, locale: "fr" });
    await start(true);
    await html("/zh/exhibitions/" + prefix);
    await readOnly(async () => {
      for (const [locale, heading] of [
        ["zh", "订阅本届展会"],
        ["en", "Subscribe to this edition"],
      ]) {
        const page = await html(`/${locale}/exhibitions/${prefix}`);
        assert.equal((page.match(/<section class="subscription-panel"/g) ?? []).length, 1);
        const form = section(page);
        assert.ok(form.includes(heading));
        assert.match(form, /Fictional subscribed &lt;fair&gt; &amp; edition/);
        assert.doesNotMatch(form, /<select|<option/);
        assert.match(form, /name="exhibitionKey"/);
      }
      assert.equal(section(await html("/fr/exhibitions/" + prefix)), "");
      assert.match(section(await html("/zh/exhibitions")), /<select/);
      assert.equal((await fetch(base + "/api/subscriptions/request")).status, 405);
    });
    const address = await submit();
    const record = (
      await p.find({ collection: "subscriptions", where: { email: { equals: address } } })
    ).docs[0];
    assert.equal(record.status, "pending");
    assert.equal(record.topic, "exhibition:" + prefix);
    assert.equal(Object.hasOwn(record, "exhibitionKey"), false);
    const jobs = (
      await p.find({
        collection: "subscription-mail-jobs",
        where: { subscription: { equals: record.id } },
      })
    ).docs;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].deliverPolicy, false);
    assert.equal(jobs[0].status, "queued");
    await submit({ sourcePath: "/zh/exhibitions/wrong" }, 400);
    await submit({ topic: "policy-updates" }, 400);
    await submit({ policyReference: "a".repeat(64) }, 400);
    await mutateContent(p, admin, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: {
        ...body,
        title: "Unreviewed subscription title",
        exhibition: { ...body.exhibition!, status: "cancelled" },
      },
    });
    await readOnly(async () => {
      assert.doesNotMatch(section(await html("/zh/exhibitions/" + prefix)), /Unreviewed/);
    });
    for (const status of ["pending", "postponed", "cancelled", "ended"] as const) {
      draft = await release(
        {
          ...body,
          exhibition: {
            ...body.exhibition!,
            status,
            startDate:
              status === "pending" || status === "postponed"
                ? ""
                : status === "ended"
                  ? "2020-01-01"
                  : body.exhibition!.startDate,
            endDate:
              status === "pending" || status === "postponed"
                ? ""
                : status === "ended"
                  ? "2020-01-03"
                  : body.exhibition!.endDate,
            unresolved: "Fictional dates awaiting confirmation",
          },
        },
        draft.id,
      );
      await readOnly(async () => {
        const form = section(await html("/zh/exhibitions/" + prefix));
        if (status === "pending") assert.match(form, /日期待公布/);
        else if (status === "postponed") assert.match(form, /延期，日期待确认/);
        else assert.equal(form, "", "Invalid edition must not fall back to general alerts");
      });
    }
    const current = await p.findByID({ collection: "content-drafts", id: draft.id });
    await mutateContent(p, admin, {
      action: "unpublish",
      id: draft.id,
      revision: current.revision,
      overrideReason: "Fictional subscription HTTP withdrawal",
    });
    await readOnly(async () => {
      await html("/zh/exhibitions/" + prefix, 404);
      assert.match(section(await html("/en/exhibitions/" + prefix)), /Subscribe to this edition/);
    });
    await submit({}, 400);
    draft = await release(body, draft.id);
    await stop();
    await start(false);
    await readOnly(async () => {
      assert.equal(section(await html("/zh/exhibitions/" + prefix)), "");
    });
    await submit({}, 503);
    console.log(
      "PASS single-edition subscription HTTP: real Next forms and POST, fixed edition, legacy list, language/configuration gates, approved snapshot, unknown dates, withdrawal and read-only GET",
    );
  } finally {
    await stop();
    for (const id of ids) {
      const current = await p.findByID({ collection: "content-drafts", id });
      await mutateContent(p, admin, {
        action: "unpublish",
        id,
        revision: current.revision,
        overrideReason: "Fictional subscription HTTP cleanup",
      });
    }
    for (const email of emails)
      for (const row of (
        await p.find({ collection: "subscriptions", where: { email: { equals: email } } })
      ).docs) {
        for (const collection of ["subscription-credentials", "subscription-mail-jobs"] as const)
          for (const item of (
            await p.find({
              collection,
              where: { subscription: { equals: row.id } },
              pagination: false,
            })
          ).docs)
            await p.delete({ collection, id: item.id });
        await p.delete({ collection: "subscriptions", id: row.id });
      }
    for (const id of privacy) await p.delete({ collection: "content-published", id });
    await p.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
    await db.end();
  }
}
