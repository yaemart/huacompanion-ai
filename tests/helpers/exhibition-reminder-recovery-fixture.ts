import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { ContentBody } from "../../src/lib/content-model";
import { emptyExhibition, shanghaiToday } from "../../src/lib/exhibitions";
import { mutateContent } from "../../src/server/content/service";
import { previewExhibitionReminders } from "../../src/server/exhibition-reminders";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { databaseFingerprints } from "./database-fingerprints";

export function assertRecoveryDatabase() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(process.env.APP_ENV, "local");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
  assert.ok(!url.search && !url.hash);
  assert.ok(
    (url.port === "55442" && url.username === "hua_demo") ||
      (process.env.GITHUB_ACTIONS === "true" && url.port === "55438" && url.username === "hua"),
  );
}
export async function recoveryFixture(p: Payload) {
  assertRecoveryDatabase();
  const env = { ...process.env },
    people: number[] = [],
    drafts: number[] = [],
    audits: number[] = [];
  const key = "inspect-" + randomUUID(),
    scope = { key, locale: "zh" as const };
  Object.assign(process.env, {
    SUBSCRIPTIONS_ENABLED: "true",
    PRIVACY_VERSION: "inspection-v1",
    SITE_LOCALES: "en,zh",
    WORKFLOW_MAIL_ENABLED: "false",
  });
  const originalFetch = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    throw Error("No outbound in recovery acceptance");
  };
  const person = async (role: "admin" | "manager" | "editor") => {
    const password = randomBytes(32).toString("hex");
    const user = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "Fictional recovery",
        email: `${role}-${people.length}-${key}@example.invalid`,
        active: true,
        role,
        password,
        ...(role === "editor" ? { contentKinds: ["exhibition" as const] } : {}),
      },
    });
    people.push(user.id);
    const login = async () => {
      const { token } = await p.login({
        collection: "staff",
        data: { email: user.email, password },
      });
      assert.ok(token);
      return new Headers({ authorization: "JWT " + token });
    };
    return { user, password, login, headers: await login() };
  };
  const admin = await person("admin"),
    other = await person("admin"),
    manager = await person("manager");
  await setCampaignGrant(p, other.user, {
    staffId: manager.user.id,
    topic: "policy-updates",
    enabled: true,
  });
  const today = (
    await p.db.pool.query(
      "SELECT (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date::text AS today",
    )
  ).rows[0].today as string;
  const plus = (days: number) =>
    new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  const body: ContentBody = {
    kind: "exhibition",
    locale: "zh",
    contentKey: key,
    slug: key,
    title: "Fictional approved recovery fair",
    summary: "Fictional only",
    blocks: [{ type: "paragraph", text: "Fictional acceptance only." }],
    sources: [
      {
        id: "official",
        title: "Fictional official",
        url: "https://example.invalid/recovery",
        checkedAt: shanghaiToday(),
      },
    ],
    exhibition: {
      ...emptyExhibition(),
      edition: "Fictional edition",
      audience: "Fictional buyers",
      exhibits: "Fictional hardware",
      city: "shanghai",
      venue: "Fictional venue",
      address: "Fictional address",
      admission: "Fictional entry",
      officialURL: "https://example.invalid/recovery",
      verifiedAt: shanghaiToday(),
      industries: ["hardware"],
      status: "announced",
      startDate: plus(30),
      endDate: plus(32),
    },
  };
  let d = await mutateContent(p, admin.user, { action: "save", body });
  drafts.push(d.id);
  d = await mutateContent(p, admin.user, { action: "submit", id: d.id, revision: d.revision });
  await mutateContent(p, admin.user, {
    action: "publish",
    id: d.id,
    revision: d.revision,
    exhibitionReviewed: true,
    overrideReason: "Fictional recovery acceptance",
  });
  const sub = await p.create({
    collection: "subscriptions",
    data: {
      email: `${key}@example.invalid`,
      topic: "exhibition:" + key,
      locale: "zh",
      status: "confirmed",
      consentVersion: 1,
      privacyVersion: "inspection-v1",
      consentedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      sourcePath: "/zh",
    },
  });
  const preview = await previewExhibitionReminders(p, admin.headers, scope);
  assert.ok(preview.receipt);
  const unchanged = async (work: () => Promise<unknown>) => {
    const before = await databaseFingerprints(p.db.pool);
    await work();
    assert.deepEqual(await databaseFingerprints(p.db.pool), before);
  };
  return {
    admin,
    other,
    manager,
    scope,
    receipt: preview.receipt,
    person,
    audits,
    unchanged,
    async cleanup() {
      await p.db.pool.query("DELETE FROM exhibition_reminder_jobs WHERE scope=$1", [
        JSON.stringify([key, "zh"]),
      ]);
      await p.db.pool.query(
        "DELETE FROM audit_events WHERE actor_id=ANY($1::int[]) OR id=ANY($2::int[])",
        [people, audits],
      );
      await p.delete({ collection: "subscriptions", id: sub.id });
      for (const id of drafts) {
        await p.db.pool.query("DELETE FROM content_published WHERE draft_id=$1", [id]);
        await p.delete({ collection: "content-drafts", id });
      }
      await p.db.pool.query(
        "DELETE FROM subscription_campaign_grants WHERE staff_id=ANY($1::int[])",
        [people],
      );
      for (const id of people) await p.delete({ collection: "staff", id });
      for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
      Object.assign(process.env, env);
      globalThis.fetch = originalFetch;
      assert.equal(outbound, 0);
    },
  };
}
