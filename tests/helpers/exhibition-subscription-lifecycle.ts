import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import type { Payload } from "payload";
import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition, shanghaiToday } from "../../src/lib/exhibitions";
import { listPublished, mutateContent } from "../../src/server/content/service";
import { queueSubscription, subscriptionLockKey } from "../../src/server/subscriptions";
import { runSubscriptionMail } from "../../src/server/subscription-mail";
import type { MailMessage } from "../../src/server/workflow/mail";
import { POST as requestSubscription } from "../../src/app/(frontend)/api/subscriptions/request/route";
import {
  GET as openLink,
  POST as useLink,
} from "../../src/app/(frontend)/email-subscription/route";
import { GET as manage } from "../../src/app/(frontend)/api/subscriptions/manage/route";
import { POST as exportCSV } from "../../src/app/(frontend)/api/subscriptions/export/route";
import { advanceDispatchClock } from "./dispatch-clock";
import { databaseFingerprints } from "./database-fingerprints";
import { publishFictionalSubscriptionPrivacy } from "./subscription-fixtures";

export async function testExhibitionSubscription(p: Payload) {
  assert.equal(process.env.APP_ENV, "local");
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  const env = { ...process.env };
  const settings = await p.findGlobal({ slug: "workflow-settings" });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  const holder = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await db.connect();
  await holder.connect();
  const prefix = "expo-sub-" + randomUUID();
  const emails: string[] = [];
  const drafts: number[] = [];
  const people: number[] = [];
  const privacy: number[] = [];
  const origin = new URL(process.env.APP_URL!).origin;
  const email = () => {
    const value = `${emails.length}-${prefix}@example.invalid`;
    emails.push(value);
    return value;
  };
  const json = (path: string, data: unknown, token = "") =>
    new Request(origin + path, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(token ? { authorization: "JWT " + token } : {}),
      },
      body: JSON.stringify(data),
    });
  const person = async (role: "admin" | "editor") => {
    const password = randomBytes(32).toString("base64url");
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "Fictional edition subscription",
        email: `${role}-${people.length}-${prefix}@example.invalid`,
        password,
        active: true,
        role,
        ...(role === "editor" ? { contentKinds: ["exhibition" as const] } : {}),
      },
    });
    people.push(user.id);
    const token = (await p.login({ collection: "staff", data: { email: user.email, password } }))
      .token!;
    return { user, token };
  };
  const unchanged = async (work: () => Promise<unknown>) => {
    const before = await databaseFingerprints(db);
    await work();
    assert.deepEqual(await databaseFingerprints(db), before);
  };
  const rows = async (address: string) =>
    (await p.find({ collection: "subscriptions", where: { email: { equals: address } }, depth: 0 }))
      .docs;
  const waitFor = async (query: string, values: unknown[]) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if ((await db.query(query, values)).rows.length) return;
      await delay(20);
    }
    assert.fail("Expected database lock wait was not observed");
  };
  try {
    Object.assign(process.env, {
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_REQUESTS_ENABLED: "true",
      SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
      WORKFLOW_MAIL_ENABLED: "true",
      WORKFLOW_MAIL_API_KEY: "fictional-injected-only",
      WORKFLOW_MAIL_FROM: "fictional@example.invalid",
      PRIVACY_VERSION: "fictional-edition-v1",
      SITE_LOCALES: "en,zh",
    });
    await p.updateGlobal({ slug: "workflow-settings", data: { emailEnabled: true } });
    const admin = await person("admin");
    for (const locale of ["zh", "en"] as const)
      privacy.push((await publishFictionalSubscriptionPrivacy(p, locale)).id);
    const fixture: ContentBody = {
      kind: "exhibition",
      locale: "zh",
      contentKey: prefix,
      slug: prefix,
      title: "Fictional approved fair <A>",
      summary: "Fictional test only",
      blocks: [{ type: "paragraph", text: "Fictional subscription test, not travel information." }],
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
        edition: "Fictional 2090 edition",
        audience: "Fictional buyers",
        exhibits: "Fictional hardware",
        unresolved: "Fictional dates awaiting confirmation",
        status: "announced",
        startDate: "2090-01-01",
        endDate: "2090-01-03",
        city: "shanghai",
        industries: ["hardware"],
        venue: "Fictional venue",
        address: "Fictional address",
        admission: "Fictional entry",
        officialURL: "https://example.invalid/fair",
        verifiedAt: shanghaiToday(),
      },
    };
    const release = async (body: ContentBody, id?: number) => {
      const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
      let d = await mutateContent(p, admin.user, {
        action: "save",
        id,
        revision: current?.revision,
        body,
      });
      if (!id) drafts.push(d.id);
      d = await mutateContent(p, admin.user, { action: "submit", id: d.id, revision: d.revision });
      return mutateContent(p, admin.user, {
        action: "publish",
        id: d.id,
        revision: d.revision,
        exhibitionReviewed: true,
        overrideReason: "Fictional subscription verification",
      });
    };
    let draft = await release(fixture);
    await release({ ...fixture, locale: "en", title: "Fictional translated fair" });
    const input = (address = email()) => ({
      email: address,
      topic: "exhibition:" + prefix,
      exhibitionKey: prefix,
      locale: "zh",
      sourcePath: "/zh/exhibitions/" + prefix,
      privacyVersion: "fictional-edition-v1",
      consent: true,
      contactFax: "",
    });
    const initial = input();
    assert.equal(
      (
        await requestSubscription(
          json("/api/subscriptions/request", { ...initial, topic: "policy-updates" }),
        )
      ).status,
      400,
      "Dedicated marker cannot silently subscribe another topic",
    );
    for (const patch of [
      { exhibitionKey: null },
      { title: "Forged title" },
      { policyReference: "a".repeat(64) },
      { locale: "fr" },
      { sourcePath: "/zh/exhibitions/other-slug" },
    ])
      assert.equal(
        (await requestSubscription(json("/api/subscriptions/request", { ...input(), ...patch })))
          .status,
        400,
      );
    assert.equal((await rows(initial.email)).length, 0);
    await unchanged(() =>
      assert.rejects(
        queueSubscription(p, { ...input(), sourcePath: "/zh/exhibitions/other-slug" }, origin),
      ),
    );

    // Keep the publication lock held on an independent connection; observe the real queue waiting.
    for (const change of ["withdrawal", "cancellation"] as const) {
      const raced = input();
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(726271)");
      const pending = queueSubscription(p, raced, origin).then(
        () => ({ error: undefined }),
        (error: unknown) => ({ error }),
      );
      try {
        await waitFor(
          "SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=0 AND objid=726271 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
          [],
        );
        await holder.query(
          change === "withdrawal"
            ? "UPDATE content_published SET active=false WHERE body->>'contentKey'=$1 AND body->>'locale'='zh'"
            : "UPDATE content_published SET body=jsonb_set(body,'{exhibition,status}','\"cancelled\"') WHERE body->>'contentKey'=$1 AND body->>'locale'='zh'",
          [prefix],
        );
        await holder.query("COMMIT");
        assert.ok(
          (await pending).error,
          "Withdrawal committed first must reject the waiting application",
        );
        assert.equal((await rows(raced.email)).length, 0);
      } finally {
        await holder.query("ROLLBACK");
        await pending;
      }
      draft = await release(fixture, draft.id);
    }
    const first = input();
    await holder.query("BEGIN");
    const holderPID = (await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      subscriptionLockKey(first.email, ""),
    ]);
    const application = queueSubscription(p, first, origin);
    let withdrawal: Promise<unknown> | undefined;
    try {
      await waitFor("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [
        holderPID,
      ]);
      withdrawal = mutateContent(p, admin.user, {
        action: "unpublish",
        id: draft.id,
        revision: draft.revision,
        overrideReason: "Fictional controlled withdrawal",
      });
      await waitFor(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=0 AND objid=726271 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
        [],
      );
      await holder.query("COMMIT");
      await application;
      await withdrawal;
      assert.equal((await rows(first.email))[0].status, "pending");
      assert.equal(
        (await listPublished(p, "zh")).some((b) => b.contentKey === prefix),
        false,
      );
    } finally {
      await holder.query("ROLLBACK");
      await Promise.allSettled([application, ...(withdrawal ? [withdrawal] : [])]);
    }
    draft = await release(fixture, draft.id);
    const main = input();
    assert.equal((await requestSubscription(json("/api/subscriptions/request", main))).status, 202);
    assert.equal((await rows(main.email))[0].status, "pending");
    const messages: MailMessage[] = [];
    const mainID = (await rows(main.email))[0].id;
    for (let attempt = 0; attempt < 10 && !messages.some((m) => m.to === main.email); attempt++) {
      await advanceDispatchClock(p);
      // Advance only this unattempted queued fixture, preserving committed in-flight leases.
      await db.query(
        "UPDATE subscription_mail_jobs SET next_at=statement_timestamp() WHERE subscription_id=$1 AND status='queued'",
        [mainID],
      );
      await runSubscriptionMail(p, async (message) => {
        assert.ok(message.to.endsWith("@example.invalid"));
        messages.push(message);
        return { status: "sent" };
      });
    }
    const message = messages.find((m) => m.to === main.email)!;
    assert.ok(message);
    assert.match(message.subject, /单场展会/);
    assert.doesNotMatch(message.subject, /Fictional approved/);
    const confirm = new URL(message.text.match(/https?:\/\/\S+action=confirm\S+/)![0]);
    const unsubscribe = new URL(message.text.match(/https?:\/\/\S+action=unsubscribe\S+/)![0]);
    const act = (link: URL) =>
      useLink(
        json(link.pathname + link.search, {
          token: new URLSearchParams(link.hash.slice(1)).get("token"),
        }),
      );
    await mutateContent(p, admin.user, {
      action: "unpublish",
      id: draft.id,
      revision: draft.revision,
      overrideReason: "Fictional controlled withdrawal",
    });
    await unchanged(async () => {
      assert.equal(openLink(new Request(confirm)).status, 200);
      assert.equal(openLink(new Request(unsubscribe)).status, 200);
    });
    assert.equal((await act(confirm)).status, 200, "Existing consent can confirm after withdrawal");
    assert.equal((await rows(main.email))[0].status, "confirmed");
    draft = await release(fixture, draft.id);
    const stable = (await rows(main.email))[0];
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at=now()-interval '16 minutes' WHERE subscription_id=$1",
      [stable.id],
    );
    await queueSubscription(
      p,
      { ...main, locale: "en", sourcePath: "/en/exhibitions/" + prefix },
      origin,
    );
    assert.deepEqual(
      (await rows(main.email))[0],
      stable,
      "Confirmed language and consent must not silently change",
    );
    assert.equal(
      (
        await p.find({
          collection: "subscription-mail-jobs",
          where: { subscription: { equals: stable.id } },
        })
      ).totalDocs,
      1,
    );
    const next = {
      ...fixture,
      contentKey: prefix + "-next",
      slug: prefix + "-next",
      exhibition: { ...fixture.exhibition!, startDate: "2091-01-01", endDate: "2091-01-03" },
    };
    await release(next);
    draft = await release(
      { ...fixture, exhibition: { ...fixture.exhibition!, nextEditionKey: next.contentKey } },
      draft.id,
    );
    assert.equal(
      (await rows(main.email)).length,
      1,
      "Publishing the next edition creates no subscriber",
    );
    await mutateContent(p, admin.user, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: {
        ...fixture,
        title: "Unreviewed title",
        exhibition: { ...fixture.exhibition!, status: "cancelled" },
      },
    });
    await queueSubscription(p, input(), origin);
    assert.equal(
      (await listPublished(p, "zh")).find((b) => b.contentKey === prefix)!.title,
      fixture.title,
    );
    draft = await release(
      { ...fixture, exhibition: { ...fixture.exhibition!, status: "cancelled" } },
      draft.id,
    );
    await unchanged(() => assert.rejects(queueSubscription(p, input(), origin)));
    assert.equal(
      (await act(unsubscribe)).status,
      200,
      "Withdrawal of consent never depends on live exhibit",
    );
    assert.equal((await rows(main.email))[0].status, "unsubscribed");
    assert.equal((await act(confirm)).status, 400);
    draft = await release(fixture, draft.id);
    await db.query(
      "UPDATE subscription_mail_jobs SET created_at=now()-interval '16 minutes' WHERE subscription_id=$1",
      [stable.id],
    );
    await queueSubscription(
      p,
      { ...main, locale: "en", sourcePath: "/en/exhibitions/" + prefix },
      origin,
    );
    assert.equal((await rows(main.email))[0].locale, "en");
    assert.equal((await rows(main.email))[0].status, "pending");
    assert.equal(
      (await act(unsubscribe)).status,
      400,
      "Old credential cannot revoke renewed consent",
    );

    const editor = await person("editor");
    const report = (token: string) =>
      manage(
        new Request(origin + "/api/subscriptions/manage?topic=" + encodeURIComponent(main.topic), {
          headers: { authorization: "JWT " + token },
        }),
      );
    const snapshot = await report(admin.token);
    assert.equal(snapshot.status, 200);
    assert.ok(
      (await snapshot.json()).rows.some((row: { email: string }) => row.email === main.email),
    );
    await unchanged(async () => {
      assert.equal((await report(editor.token)).status, 403);
      assert.equal((await manage(new Request(origin + "/api/subscriptions/manage"))).status, 403);
    });
    const csv = await exportCSV(
      json("/api/subscriptions/export", { topic: main.topic, status: "" }, admin.token),
    );
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), new RegExp(main.email));
    const keeper = await person("admin");
    await p.update({
      collection: "staff",
      user: keeper.user,
      id: admin.user.id,
      data: { active: false },
    });
    await unchanged(async () => assert.equal((await report(admin.token)).status, 403));
    await p.update({
      collection: "staff",
      user: keeper.user,
      id: admin.user.id,
      data: { active: true },
    });
    assert.equal(
      (await p.find({ collection: "subscription-campaign-jobs", pagination: false })).docs.some(
        (j) => j.subscription === stable.id,
      ),
      false,
    );
    console.log(
      "PASS single-edition subscription: request contract, real lock ordering, consent/withdrawal, language, edition isolation and administrator management",
    );
  } finally {
    await holder.query("ROLLBACK").catch(() => {});
    for (const id of drafts) {
      const row = await p.findByID({ collection: "content-drafts", id });
      if (row)
        await mutateContent(p, await p.findByID({ collection: "staff", id: people[0] }), {
          action: "unpublish",
          id,
          revision: row.revision,
          overrideReason: "Fictional subscription cleanup",
        });
    }
    for (const address of emails)
      for (const row of await rows(address)) {
        for (const collection of ["subscription-credentials", "subscription-mail-jobs"] as const) {
          const items = (
            await p.find({
              collection,
              where: { subscription: { equals: row.id } },
              pagination: false,
            })
          ).docs;
          for (const item of items) await p.delete({ collection, id: item.id });
        }
        await p.delete({ collection: "subscriptions", id: row.id });
      }
    for (const id of privacy) await p.delete({ collection: "content-published", id });
    for (const id of people) await p.delete({ collection: "staff", id });
    await p.updateGlobal({
      slug: "workflow-settings",
      data: { emailEnabled: settings.emailEnabled },
    });
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await holder.end();
    await db.end();
  }
}
