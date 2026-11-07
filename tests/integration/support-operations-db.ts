import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { retentionAction } from "../../src/server/support/operations";

// Run serially on the local fixture database. All writes, including settings,
// audit rows and deletion tests, live in one transaction that always rolls back.
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
let transactionID: any;
try {
  transactionID = await p.db.beginTransaction();
  if (!transactionID) throw Error("Transaction required");
  const req = { transactionID };
  await (p.db.sessions as any)[transactionID].db.execute("SELECT pg_advisory_xact_lock(726280)");
  // Retention owns a transaction in production. Reuse this test transaction without
  // committing it; actual Payload CRUD and actual adapter writes remain unchanged.
  const transactionDB = new Proxy(p.db, {
    get(target, key) {
      if (key === "beginTransaction") return async () => transactionID;
      if (key === "commitTransaction" || key === "rollbackTransaction") return async () => {};
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const fixtureP = new Proxy(p, {
    get(target, key) {
      if (key === "db") return transactionDB;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  assert.ok(admin, "Local active administrator fixture required");
  const actor = { ...admin, collection: "staff" };
  const before = await p.findGlobal({ slug: "support-settings", req });
  await p.updateGlobal({
    slug: "support-settings",
    data: {
      textRetentionDays: 3650,
      audioRetentionDays: 3000,
      transcriptRetentionDays: 3200,
      retentionDeletionEnabled: false,
    },
    req,
  });
  const old = new Date(Date.now() - 3651 * 86400000).toISOString(),
    mediaAge = new Date(Date.now() - 3100 * 86400000).toISOString(),
    key = randomUUID();
  const c = await p.create({
    collection: "support-conversations",
    data: {
      visitorHash: key,
      startKey: key,
      locale: "en",
      topic: "general",
      mode: "human",
      status: "resolved",
      revision: 1,
      aiRevision: 1,
      summary: "Fictional retention summary",
      proposedRequest: { fictional: true },
    },
    req,
  });
  await p.db.updateOne({
    collection: "support-conversations",
    id: c.id,
    data: { createdAt: old, updatedAt: old },
    req,
  });
  const audio = await p.create({
    collection: "support-voice-audio",
    data: {
      conversation: c.id,
      dedupe: key,
      digest: key,
      body: "ZmljdGlvbmFsIGF1ZGlv",
      seconds: 1,
    },
    req,
  });
  await p.db.updateOne({
    collection: "support-voice-audio",
    id: audio.id,
    data: { createdAt: mediaAge, updatedAt: mediaAge },
    req,
  });
  const message = await p.create({
    collection: "support-messages",
    data: {
      conversation: c.id,
      dedupe: key,
      author: "customer",
      visibility: "public",
      text: "Fictional retention text",
      voiceAudio: audio.id,
      voiceTranscript: "Fictional independent transcript",
    },
    req,
  });
  await p.db.updateOne({
    collection: "support-messages",
    id: message.id,
    data: { createdAt: mediaAge, updatedAt: mediaAge },
    req,
  });
  await assert.rejects(() =>
    retentionAction(
      fixtureP,
      { ...actor, role: "operations", additionalRoles: [] },
      { action: "preview", kind: "text" },
    ),
  );
  const text = await retentionAction(fixtureP, actor, { action: "preview", kind: "text" });
  // Fail closed if any unrelated record would be affected: execute no cleanup.
  assert.deepEqual(text.ids, [c.id], "Refuse to execute: text preview includes non-fixture data");
  await assert.rejects(() =>
    retentionAction(fixtureP, actor, {
      action: "execute",
      kind: "text",
      token: text.token,
      confirm: "DELETE SUPPORT CONTENT",
    }),
  );
  await p.updateGlobal({ slug: "support-settings", data: { retentionDeletionEnabled: true }, req });
  await assert.rejects(() =>
    retentionAction(fixtureP, actor, {
      action: "execute",
      kind: "text",
      token: text.token,
      confirm: "yes",
    }),
  );
  await retentionAction(fixtureP, actor, {
    action: "execute",
    kind: "text",
    token: text.token,
    confirm: "DELETE SUPPORT CONTENT",
  });
  const retained = await p.findByID({ collection: "support-conversations", id: c.id, req });
  assert.equal(
    new Date(retained.updatedAt).getTime(),
    new Date(old).getTime(),
    "Real adapter must preserve the conversation activity timestamp",
  );
  assert.equal(retained.summary, null);
  assert.equal(retained.proposedRequest, null);
  assert.equal(
    (await p.findByID({ collection: "support-messages", id: message.id, req })).voiceTranscript,
    "Fictional independent transcript",
  );
  const audioPreview = await retentionAction(fixtureP, actor, { action: "preview", kind: "audio" });
  assert.deepEqual(
    audioPreview.ids,
    [audio.id],
    "Refuse to execute: audio preview includes non-fixture data",
  );
  await retentionAction(fixtureP, actor, {
    action: "execute",
    kind: "audio",
    token: audioPreview.token,
    confirm: "DELETE SUPPORT CONTENT",
  });
  assert.equal(
    (await p.count({ collection: "support-voice-audio", where: { id: { equals: audio.id } }, req }))
      .totalDocs,
    0,
  );
  const afterAudio = await p.findByID({ collection: "support-messages", id: message.id, req });
  assert.equal(afterAudio.voiceAudio, null);
  assert.equal(afterAudio.voiceTranscript, "Fictional independent transcript");
  const tooYoung = await retentionAction(fixtureP, actor, {
    action: "preview",
    kind: "transcript",
  });
  assert.deepEqual(
    tooYoung.ids,
    [],
    "Longer transcript policy retains younger transcript; abort if unrelated candidates exist",
  );
  await p.updateGlobal({ slug: "support-settings", data: { transcriptRetentionDays: 3000 }, req });
  const transcript = await retentionAction(fixtureP, actor, {
    action: "preview",
    kind: "transcript",
  });
  assert.deepEqual(
    transcript.ids,
    [message.id],
    "Refuse to execute: transcript preview includes non-fixture data",
  );
  await retentionAction(fixtureP, actor, {
    action: "execute",
    kind: "transcript",
    token: transcript.token,
    confirm: "DELETE SUPPORT CONTENT",
  });
  assert.equal(
    (await p.findByID({ collection: "support-messages", id: message.id, req })).voiceTranscript,
    null,
  );
  assert.equal(
    (await p.count({ collection: "support-conversations", where: { id: { equals: c.id } }, req }))
      .totalDocs,
    1,
  );
  await p.db.rollbackTransaction(transactionID);
  transactionID = undefined;
  // Prove settings and fixtures were rolled back, rather than merely assuming it.
  const after = await p.findGlobal({ slug: "support-settings" });
  for (const field of [
    "textRetentionDays",
    "audioRetentionDays",
    "transcriptRetentionDays",
    "retentionDeletionEnabled",
  ] as const)
    assert.equal(after[field], before[field]);
  assert.equal(
    (await p.count({ collection: "support-conversations", where: { id: { equals: c.id } } }))
      .totalDocs,
    0,
  );
  console.log(
    "PASS real DB retention privilege, disabled/confirmation guards, preserved activity timestamp, sequential independent policies and complete rollback",
  );
} finally {
  if (transactionID) await p.db.rollbackTransaction(transactionID);
  await p.destroy();
}
process.exit(0);
