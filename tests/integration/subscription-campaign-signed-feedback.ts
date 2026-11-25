import { readNextCampaignMockSlot } from "../../src/server/subscription-campaign-scheduling";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac, createHash } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { once } from "node:events";
import type { Payload } from "payload";
import pg from "pg";
import { relationID } from "../../src/cms/access";
import { setCampaignGrant } from "../../src/server/subscription-campaign-access";
import { readCampaignWorkspace } from "../../src/server/subscription-campaign-workspace";
import {
  saveCampaignDraft,
  readCampaignDraft,
} from "../../src/server/subscription-campaign-drafts";
import { campaignMockChecks } from "../../src/server/subscription-campaign-mock-checks";
import { freezeCampaignRecipients } from "../../src/server/subscription-campaign-freeze";
import {
  setMockCampaignBudget,
  reserveMockCampaignSlot,
} from "../../src/server/subscription-campaign-quota";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
} from "../../src/server/subscription-campaign-leases";
import { recordLocalCampaignFeedback } from "../../src/server/subscription-campaign-feedback";
import { createMockCampaignWorker } from "../../src/server/subscription-campaign-worker";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { resumeMockCampaignRevision } from "../../src/server/subscription-campaign-continuation";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { advanceDispatchClock } from "../helpers/dispatch-clock";
export async function testSignedCampaignFeedback(p: Payload, url: URL) {
  const binding = await import("../../src/server/subscription-campaign-mail-binding").catch(
    () => null,
  );
  const route =
    await import("../../src/app/(frontend)/api/subscriptions/campaign-feedback/route").catch(
      () => null,
    );
  assert.ok(
    binding?.bindLocalCampaignMail && route?.POST,
    "signed HTTP feedback and mail binding must exist",
  );
  const bind = binding.bindLocalCampaignMail;
  const env = { ...process.env },
    key = randomUUID(),
    people: number[] = [],
    subscriptions: number[] = [];
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const server = createServer((req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const input = new Request("http://127.0.0.1/api/subscriptions/campaign-feedback", {
      method: req.method,
      headers,
      ...(req.method === "POST" ? { body: Readable.toWeb(req), duplex: "half" } : {}),
    } as RequestInit);
    (req.method === "POST"
      ? route.POST(input)
      : Promise.resolve(new Response(null, { status: 405 }))
    )
      .then(async (out) => {
        res.writeHead(out.status, Object.fromEntries(out.headers));
        res.end(Buffer.from(await out.arrayBuffer()));
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port,
    endpoint = `http://127.0.0.1:${port}`;
  const secret = "whsec_" + randomBytes(32).toString("base64");
  const send = async (
    body: object | string,
    id = "msg_" + randomUUID(),
    seconds = String(Math.floor(Date.now() / 1000)),
    tamper = false,
  ) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${seconds}.${text}`)
      .digest("base64");
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": seconds,
        "svix-signature": "v1," + signature,
      },
      body: text + (tamper ? " " : ""),
    });
  };
  const person = async (role: "admin" | "manager") => {
    const row = await p.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: "虚构签名闭环",
        email: `${people.length}-${key}@example.invalid`,
        password: key,
        role,
        active: true,
      },
    });
    people.push(row.id);
    return row;
  };
  try {
    process.env.VISA_CHECKER_ENABLED = "true";
    process.env.PRIVACY_VERSION = key;
    const admin = await person("admin"),
      manager = await person("manager");
    await setCampaignGrant(p, admin, {
      staffId: manager.id,
      topic: "policy-updates",
      enabled: true,
    });
    const choices = (await readCampaignWorkspace(p, manager)).choices.filter(
      (c) => c.policies.zh && c.policies.en,
    );
    assert.ok(choices.length >= 2);
    for (let i = 0; i < 2; i++)
      subscriptions.push(
        (
          await p.create({
            collection: "subscriptions",
            data: {
              email: `${i}-${key}@example.invalid`,
              topic: "policy-updates",
              locale: "en",
              status: "confirmed",
              consentVersion: 1,
              privacyVersion: key,
              sourcePath: "/en",
              consentedAt: new Date().toISOString(),
              confirmedAt: new Date().toISOString(),
            },
          })
        ).id,
      );
    const prepare = async (input: { campaignKey: string; revision: number }) => {
      const test = await campaignMockChecks(p, manager, "test", input);
      await campaignMockChecks(p, manager, "confirm", {
        ...input,
        testId: test.testId,
        readable: ["zh", "en"],
      });
    };
    const make = async () => {
      const d = await saveCampaignDraft(p, manager, { policies: [choices[0].policies] });
      const input = { campaignKey: d.campaignKey, revision: d.revision };
      await prepare(input);
      await freezeCampaignRecipients(p, manager, input);
      return input;
    };
    const input = await make(),
      unattempted = await make();
    await setMockCampaignBudget(p, admin, { remaining: 20, reason: "虚构签名闭环" });
    const started = async () => {
      await advanceDispatchClock(p);
      const slot = await reserveMockCampaignSlot(p, manager, { ...input, key: randomUUID() });
      assert.equal(slot.state, "reserved-local");
      const target = { ...input, slotId: slot.id! },
        lease = await claimMockCampaignTask(p, manager, target);
      if (lease.state !== "claimed-local") throw Error("missing lease");
      const leased = { ...target, token: lease.token };
      assert.equal((await beginMockCampaignAttempt(p, manager, leased)).state, "attempting-local");
      const attempt = (
        await p.find({
          collection: "subscription-campaign-mock-attempts",
          where: { slot: { equals: slot.id } },
          limit: 1,
          depth: 0,
        })
      ).docs[0];
      const job = await p.findByID({
        collection: "subscription-campaign-jobs",
        id: relationID(
          (
            await p.findByID({
              collection: "subscription-campaign-mock-slots",
              id: slot.id!,
              depth: 0,
            })
          ).job,
        )!,
        depth: 0,
      });
      const sub = await p.findByID({
        collection: "subscriptions",
        id: relationID(job.subscription)!,
        depth: 0,
      });
      return { leased, attempt, sub, emailId: randomUUID() };
    };
    const a = await started();
    await recordMockCampaignOutcome(p, manager, { ...a.leased, outcome: "accepted" });
    // Only advance time in this disposable fixture, retaining all original attempts and reservations.
    await db.query(
      "UPDATE subscription_campaign_mock_slots SET reserved_at=statement_timestamp()-interval '25 hours' WHERE id=$1",
      [a.leased.slotId],
    );
    await db.query(
      "UPDATE subscription_campaign_mock_attempts SET attempted_at=jsonb_build_array((statement_timestamp()-interval '16 minutes')::text) WHERE id=$1",
      [a.attempt.id],
    );
    await advanceDispatchClock(p);
    const workerSlot = await reserveMockCampaignSlot(p, manager, {
      ...unattempted,
      key: randomUUID(),
    });
    assert.equal(workerSlot.state, "reserved-local");
    assert.equal(
      (await readNextCampaignMockSlot(p, manager, unattempted)).slotId,
      workerSlot.id,
      "the independent unattempted worker slot is actually runnable before receipt suppression",
    );
    const b = await started();
    const event = (type = "email.delivered", target = a, data: object = {}) => ({
      type,
      created_at: new Date().toISOString(),
      data: { email_id: target.emailId, to: [target.sub.email], ...data },
    });
    const unchanged = async (run: () => Promise<unknown>) => {
      const before = await databaseFingerprints(db);
      await run();
      assert.deepEqual(await databaseFingerprints(db), before);
    };
    delete process.env.SUBSCRIPTION_FEEDBACK_ENABLED;
    delete process.env.SUBSCRIPTION_FEEDBACK_SIGNING_SECRET;
    await unchanged(async () => assert.equal((await send(event())).status, 404));
    process.env.SUBSCRIPTION_FEEDBACK_ENABLED = "true";
    await unchanged(async () => assert.equal((await send(event())).status, 503));
    process.env.SUBSCRIPTION_FEEDBACK_SIGNING_SECRET = secret;
    await unchanged(async () =>
      assert.equal((await send(event(), undefined, undefined, true)).status, 401),
    );
    await unchanged(async () =>
      assert.equal((await send(event(), undefined, "1731705121")).status, 401),
    );
    await unchanged(async () => assert.equal((await send("x".repeat(16385))).status, 413));
    const early = event();
    const earlyId = "msg_" + randomUUID();
    await unchanged(async () => assert.equal((await send(early, earlyId)).status, 503));
    await unchanged(async () =>
      assert.rejects(
        bind(p, manager, { emailId: a.emailId, attemptId: a.attempt.id, email: a.sub.email }),
        { status: 403 },
      ),
    );
    await bind(p, admin, { emailId: a.emailId, attemptId: a.attempt.id, email: a.sub.email });
    await unchanged(async () => {
      await bind(p, admin, { emailId: a.emailId, attemptId: a.attempt.id, email: a.sub.email });
    });
    await unchanged(async () =>
      assert.rejects(
        bind(p, admin, { emailId: a.emailId, attemptId: b.attempt.id, email: b.sub.email }),
        { status: 409 },
      ),
    );
    assert.equal((await send(early, earlyId)).status, 200);
    await unchanged(async () => assert.equal((await send(early, earlyId)).status, 200));
    await unchanged(async () =>
      assert.equal((await send({ ...early, type: "email.complained" }, earlyId)).status, 409),
    );
    const manualId = randomUUID(),
      manualTime = new Date().toISOString();
    await recordLocalCampaignFeedback(p, admin, {
      eventId: manualId,
      attemptId: a.attempt.id,
      email: a.sub.email,
      kind: "delivered",
      occurredAt: manualTime,
    });
    await unchanged(async () =>
      assert.rejects(
        recordLocalCampaignFeedback(p, admin, {
          eventId: manualId,
          attemptId: b.attempt.id,
          email: b.sub.email,
          kind: "delivered",
          occurredAt: manualTime,
        }),
        { status: 409 },
      ),
    );
    await unchanged(async () =>
      assert.equal((await send(event("email.delivered", b), earlyId)).status, 409),
    );
    await unchanged(async () =>
      assert.equal(
        (
          await send(
            event("suppression.added", b, {
              email: b.sub.email,
              source_id: null,
              origin: "manual",
            }),
          )
        ).status,
        503,
      ),
    );
    await bind(p, admin, { emailId: b.emailId, attemptId: b.attempt.id, email: b.sub.email });
    await unchanged(async () =>
      assert.equal((await send(event("email.delivered", b), earlyId)).status, 409),
    );
    await unchanged(async () =>
      assert.equal((await send(event("email.delivered", a, { to: [b.sub.email] }))).status, 409),
    );
    const misleadingId = "msg_" + randomUUID();
    assert.equal(
      (
        await send(
          event("email.delivered", a, {
            attemptId: b.attempt.id,
            tags: { attemptId: String(b.attempt.id) },
          }),
          misleadingId,
        )
      ).status,
      200,
    );
    const receiptKey = "resend:" + createHash("sha256").update(misleadingId).digest("hex");
    assert.equal(
      (
        await db.query("SELECT attempt_id FROM subscription_campaign_feedback WHERE event_id=$1", [
          receiptKey,
        ])
      ).rows[0].attempt_id,
      a.attempt.id,
    );
    for (const type of ["Temporary", "Transient", "Undetermined"])
      await unchanged(async () =>
        assert.equal((await send(event("email.bounced", a, { bounce: { type } }))).status, 200),
      );
    const complain = event("email.complained");
    const complainId = "msg_" + randomUUID();
    const responses = await Promise.all([send(complain, complainId), send(complain, complainId)]);
    assert.deepEqual(
      responses.map((r) => r.status),
      [200, 200],
    );
    assert.equal(
      (await send(event("email.bounced", a, { bounce: { type: "Permanent" } }))).status,
      200,
    );
    assert.equal((await send(event("email.suppressed"))).status, 200);
    const global = event("suppression.added", b, {
      email: b.sub.email,
      source_id: null,
      origin: "manual",
    });
    const originalCreate = p.create.bind(p);
    p.create = (async (options: Parameters<Payload["create"]>[0]) => {
      if (
        options.collection === "audit-events" &&
        "action" in options.data &&
        options.data.action === "feedback-webhook-local"
      )
        throw Error("fictional signed audit failure");
      return originalCreate(options);
    }) as Payload["create"];
    try {
      await unchanged(async () => assert.equal((await send(global)).status, 503));
    } finally {
      p.create = originalCreate;
    }
    assert.equal((await send(global)).status, 200);
    const address = (
      await db.query(
        "SELECT attempt_id,kind FROM subscription_campaign_feedback WHERE attempt_id IS NULL",
      )
    ).rows;
    assert.deepEqual(address, [{ attempt_id: null, kind: "provider-suppressed" }]);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM subscription_marketing_suppressions")).rows[0]
        .n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='feedback-webhook-local' AND actor_id IS NOT NULL",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await send(
          event("suppression.added", a, {
            email: a.sub.email,
            source_id: a.emailId,
            origin: "bounce",
          }),
        )
      ).status,
      200,
    );
    const beforeResult = await p.findByID({
      collection: "subscription-campaign-mock-attempts",
      id: a.attempt.id,
      depth: 0,
    });
    assert.equal(beforeResult.state, "completed");
    assert.equal((await beginMockCampaignAttempt(p, manager, b.leased)).state, "ineligible");
    assert.equal(
      (await recordMockCampaignOutcome(p, manager, { ...b.leased, outcome: "accepted" })).state,
      "completed-local",
    );
    const suppressionBeforeLate = (await databaseFingerprints(db)).find(
      (row) => row.table === "subscription_marketing_suppressions",
    );
    assert.equal((await send(event())).status, 200);
    assert.deepEqual(
      (await databaseFingerprints(db)).find(
        (row) => row.table === "subscription_marketing_suppressions",
      ),
      suppressionBeforeLate,
    );
    for (const type of ["suppression.removed", "email.opened", "email.clicked"])
      await unchanged(async () => assert.equal((await send(event(type))).status, 200));
    process.env.APP_ENV = "production";
    await unchanged(async () => assert.equal((await send(event())).status, 404));
    process.env.APP_ENV = "local";
    assert.equal((await fetch(endpoint)).status, 405);
    assert.equal((await readCampaignDraft(p, manager, input.campaignKey)).counts.en, 0);
    await advanceDispatchClock(p);
    const worker = createMockCampaignWorker(p, {
      ...unattempted,
      staffId: manager.id,
      outcome: "accepted",
    });
    await unchanged(async () => assert.equal((await worker()).state, "idle-local"));
    assert.equal(
      (await p.count({ collection: "subscription-campaign-mock-attempts" })).totalDocs,
      2,
    );
    const revised = await saveCampaignDraft(p, manager, {
      ...unattempted,
      policies: [choices[1].policies],
    });
    const newer = { campaignKey: revised.campaignKey, revision: revised.revision };
    await prepare(newer);
    await unchanged(async () =>
      assert.equal((await readCampaignRevisionPreflight(p, manager, newer)).counts.ineligible, 2),
    );
    await unchanged(async () =>
      assert.rejects(resumeMockCampaignRevision(p, manager, newer), { status: 409 }),
    );
    const newDraft = await saveCampaignDraft(p, manager, { policies: [choices[0].policies] });
    const newInput = { campaignKey: newDraft.campaignKey, revision: newDraft.revision };
    await prepare(newInput);
    await unchanged(async () =>
      assert.rejects(freezeCampaignRecipients(p, manager, newInput), { status: 400 }),
    );

    console.log(
      "PASS 签名HTTP回执闭环：原始体验签、私有绑定、并发重放、系统审计、全局抑制及worker/续发拒发",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.query("DELETE FROM subscription_campaign_mail_bindings");
    await db.query("DELETE FROM subscription_marketing_suppressions");
    await db.query("DELETE FROM subscription_campaign_feedback");
    for (const collection of [
      "subscription-campaign-mock-attempts",
      "subscription-campaign-mock-leases",
      "subscription-campaign-mock-slots",
      "subscription-campaign-mock-budgets",
      "subscription-campaign-controls",
      "subscription-campaign-jobs",
      "subscription-campaign-batches",
      "subscription-campaign-checks",
      "subscription-campaign-drafts",
      "subscription-campaign-grants",
    ] as const)
      await p.delete({
        collection,
        where: collection === "subscription-campaign-grants" ? { staff: { in: people } } : {},
      });
    await p.delete({ collection: "audit-events", where: { actor: { in: people } } });
    await p.delete({ collection: "staff", where: { id: { in: people } } });
    await p.delete({ collection: "subscriptions", where: { id: { in: subscriptions } } });
    await db.end();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
