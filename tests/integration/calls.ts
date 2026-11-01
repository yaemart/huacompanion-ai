import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { callAction, callRead, runCallMaintenance } from "../../src/server/support/callService";
import { visitorAction } from "../../src/server/support/service";
if (process.env.APP_ENV !== "local") throw Error("Local integration database only");
const previousEnv = { ...process.env };
Object.assign(process.env, {
  SUPPORT_CALL_GATEWAY_URL: "https://gateway.example.invalid",
  SUPPORT_CALL_GATEWAY_KEY: "fake-test-only",
  SUPPORT_CALL_AI_ENABLED: "true",
  SUPPORT_CALL_MAX_SECONDS: "60",
  SUPPORT_CALL_CONCURRENCY: "10",
  SUPPORT_CALL_DAILY_SECONDS: "60000",
  SUPPORT_CALL_MAX_CENTS_PER_MINUTE: "10",
  SUPPORT_CALL_DAILY_CENTS: "10000",
});
const realFetch = globalThis.fetch;
const sessions = new Map<string, any>();
let offers: any[] = [];
let failCleanup = false;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  assert.ok(url.startsWith("https://gateway.example.invalid/v1/"));
  const path = new URL(url).pathname.split("/");
  const id = path[3];
  const session = sessions.get(id) || {
    connectedParticipants: [],
    aiConnected: false,
    ended: false,
  };
  sessions.set(id, session);
  if (init?.method === "DELETE") {
    if (failCleanup) return new Response("", { status: 503 });
    if (path.includes("participants")) {
      session.connectedParticipants = session.connectedParticipants.filter(
        (p: string) => p !== path.at(-1),
      );
      return new Response(null, { status: 204 });
    }
    session.ended = true;
    return Response.json({
      summary: "Customer asked about cleaning; unconfirmed.",
      transcript: "Customer: Please explain cleaning options.",
    });
  }
  if (path.at(-1) === "offer") {
    const body = JSON.parse(String(init?.body));
    offers.push(body);
    return Response.json({ sdp: "v=0\r\n" });
  }
  if (path.at(-1) === "handoff") return Response.json({ ok: true });
  return Response.json(session);
};
const p = await getPayload({ config });
const settings = await p.findGlobal({ slug: "support-settings" });
const ids: number[] = [];
let extraStaff: number | undefined;
let cleanupAdmin: any;
try {
  await p.updateGlobal({
    slug: "support-settings",
    data: { textChat: true, aiCalls: true, humanCalls: true },
  });
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  cleanupAdmin = admin;
  const other = await p.create({
    collection: "staff",
    data: {
      name: "Call test admin",
      email: randomUUID() + "@example.invalid",
      password: randomUUID() + randomUUID(),
      role: "admin",
      active: true,
    },
    user: admin,
  });
  extraStaff = other.id;
  const actor = { user: admin },
    otherActor = { user: other };
  for (const a of [actor, otherActor])
    await callAction(p, a, {
      action: "presence",
      state: "available",
      languages: ["en"],
      capacity: 3,
    });
  async function start(kind = "human") {
    const hash = randomUUID();
    const conversation = await visitorAction(p, hash, {
      action: "start",
      key: randomUUID(),
      locale: "en",
      topic: "general",
      aiConsent: true,
    });
    await p.update({
      collection: "support-conversations",
      id: conversation.id,
      data: { mode: "ai" },
    });
    const input = { action: "start", conversation: conversation.id, key: randomUUID(), kind };
    const c = await callAction(p, { hash }, input);
    ids.push(c.id);
    return { hash, conversation, c, input };
  }
  const a = await start();
  assert.equal((await callAction(p, { hash: a.hash }, a.input)).id, a.c.id);
  await assert.rejects(() => callRead(p, { hash: "wrong" }, a.conversation.id));
  await assert.rejects(() =>
    callAction(
      p,
      { hash: "wrong" },
      { action: "hangup", conversation: a.conversation.id, call: a.c.id },
    ),
  );
  const results = await Promise.allSettled([
    callAction(p, actor, { action: "accept", conversation: a.conversation.id, call: a.c.id }),
    callAction(p, otherActor, { action: "accept", conversation: a.conversation.id, call: a.c.id }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const row = await (p as any).findByID({ collection: "support-calls", id: a.c.id, depth: 0 });
  const winner = row.owner === admin.id ? actor : otherActor;
  assert.equal(
    (await p.findByID({ collection: "support-conversations", id: a.conversation.id })).mode,
    "ai",
  );
  const signal = { conversation: a.conversation.id, call: a.c.id };
  await callAction(p, { hash: a.hash }, { ...signal, action: "offer", sdp: "v=0\r\n" });
  await callAction(p, winner, { ...signal, action: "offer", sdp: "v=0\r\n" });
  await callAction(p, { hash: a.hash }, { ...signal, action: "status" });
  assert.equal(
    (await p.findByID({ collection: "support-conversations", id: a.conversation.id })).mode,
    "ai",
  );
  sessions.get(row.gatewayID).connectedParticipants = ["visitor", `staff-${row.owner}`];
  assert.equal((await callAction(p, winner, { ...signal, action: "status" })).state, "active");
  assert.equal(
    (await p.findByID({ collection: "support-conversations", id: a.conversation.id })).mode,
    "human",
  );
  await callAction(p, winner, { ...signal, action: "transfer" });
  assert.ok(!sessions.get(row.gatewayID).connectedParticipants.includes(`staff-${row.owner}`));
  failCleanup = true;
  await callAction(p, { hash: a.hash }, { ...signal, action: "hangup" });
  await runCallMaintenance(p);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: a.c.id })).cleanupPending,
    true,
  );
  failCleanup = false;
  const unrelated = await start();
  await callAction(
    p,
    { hash: unrelated.hash },
    { action: "hangup", conversation: unrelated.conversation.id, call: unrelated.c.id },
  );
  await runCallMaintenance(p, a.c.id);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: unrelated.c.id })).cleanupPending,
    true,
  );
  await runCallMaintenance(p);
  await runCallMaintenance(p);
  assert.equal(
    (
      await p.count({
        collection: "support-messages",
        where: { dedupe: { equals: `call-summary:${a.c.id}` } },
      })
    ).totalDocs,
    1,
  );
  const internal = (
    await p.find({
      collection: "support-messages",
      where: { dedupe: { equals: `call-summary:${a.c.id}` } },
    })
  ).docs[0];
  assert.equal(internal.visibility, "internal");
  assert.match(internal.text, /Unconfirmed/);
  const b = await start("ai");
  const bsignal = { conversation: b.conversation.id, call: b.c.id };
  await callAction(p, { hash: b.hash }, { ...bsignal, action: "offer", sdp: "v=0\r\n" });
  assert.equal(offers.at(-1).recording, false);
  assert.equal(offers.at(-1).maxCostCents, 10);
  assert.ok(offers.at(-1).context.instructions.includes("untrusted"));
  await callAction(p, { hash: b.hash }, { ...bsignal, action: "handoff" });
  assert.equal(
    (await p.findByID({ collection: "support-conversations", id: b.conversation.id })).mode,
    "ai",
  );
  await p.update({
    collection: "support-conversations",
    id: b.conversation.id,
    data: { aiConsent: false },
  });
  await runCallMaintenance(p);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: b.c.id })).state,
    "ended",
  );
  const c = await start();
  await callAction(p, actor, { action: "accept", conversation: c.conversation.id, call: c.c.id });
  await (p as any).update({
    collection: "support-calls",
    id: c.c.id,
    data: { claimUntil: new Date(Date.now() - 1000).toISOString() },
  });
  await runCallMaintenance(p);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: c.c.id })).state,
    "queued",
  );
  await (p as any).update({
    collection: "support-calls",
    id: c.c.id,
    data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
  });
  await runCallMaintenance(p);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: c.c.id })).state,
    "expired",
  );
  const d = await start();
  await p.updateGlobal({ slug: "support-settings", data: { humanCalls: false } });
  await runCallMaintenance(p);
  assert.equal(
    (await (p as any).findByID({ collection: "support-calls", id: d.c.id })).state,
    "ended",
  );
  assert.equal(
    (
      await callAction(
        p,
        { hash: d.hash },
        { action: "status", conversation: d.conversation.id, call: d.c.id },
      )
    ).state,
    "ended",
  );
  await assert.rejects(() => start());
  const publicData = JSON.stringify(await callRead(p, { hash: a.hash }, a.conversation.id));
  assert.ok(!publicData.includes(row.gatewayID));
  assert.ok(!publicData.includes("fake-test-only"));
  console.log(
    "PASS calls: real DB ownership, idempotency, concurrent claims, gateway-only join proof, transfer, cleanup retry/dedupe, AI safety context, consent/feature revocation and expiry",
  );
} finally {
  for (const id of ids)
    await (p as any)
      .update({ collection: "support-calls", id, data: { state: "ended", cleanupPending: false } })
      .catch(() => {});
  if (extraStaff)
    await p.update({
      collection: "staff",
      id: extraStaff,
      user: cleanupAdmin,
      data: { active: false },
    });
  await p.updateGlobal({
    slug: "support-settings",
    data: {
      textChat: settings.textChat,
      aiCalls: settings.aiCalls,
      humanCalls: settings.humanCalls,
    },
  });
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
  Object.assign(process.env, previousEnv);
  await p.destroy();
}
process.exit(0);
