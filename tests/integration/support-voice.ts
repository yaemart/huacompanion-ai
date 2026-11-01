import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { visitorAction } from "../../src/server/support/service";
import { uploadVoice, readVoice } from "../../src/server/support/voice";
import { queueVoiceJob, readVoiceJob, runVoiceJob } from "../../src/server/support/voice-jobs";
import { encodeVoiceWav } from "../../src/lib/voice";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config }),
  db = p as any;
const settings = await p.findGlobal({ slug: "support-settings" });
const env = {
  endpoint: process.env.SUPPORT_SPEECH_ENDPOINT,
  key: process.env.SUPPORT_SPEECH_KEY,
  budget: process.env.SUPPORT_SPEECH_DAILY_UNITS,
};
process.env.SUPPORT_SPEECH_ENDPOINT = "https://speech.invalid/test";
process.env.SUPPORT_SPEECH_KEY = "test-only";
process.env.SUPPORT_SPEECH_DAILY_UNITS = "10000000";
try {
  await p.updateGlobal({
    slug: "support-settings",
    data: {
      voiceMessages: true,
      transcription: true,
      speechPlayback: true,
      voiceMaxSeconds: 60,
      voiceMaxBytes: 6000000,
      voiceUploadsPerMinute: 4,
    } as any,
  });
  const hash = randomUUID(),
    actor = { hash };
  const c = await visitorAction(p, hash, {
    action: "start",
    key: randomUUID(),
    locale: "en",
    topic: "general",
    aiConsent: true,
  });
  const wav = encodeVoiceWav(
    new Float32Array(16000).map((_, i) => Math.sin(i / 10) * 0.1),
    16000,
  );
  const key = randomUUID();
  const first = await uploadVoice(p, actor, c.id, key, wav);
  assert.equal(first.seconds, 1);
  assert.equal((await uploadVoice(p, actor, c.id, key, wav)).audio, first.audio);
  assert.deepEqual(new Uint8Array((await readVoice(p, actor, first.audio)).bytes), wav);
  await assert.rejects(() => readVoice(p, { hash: "different" }, first.audio));
  await assert.rejects(() => uploadVoice(p, { hash: "different" }, c.id, randomUUID(), wav));
  await assert.rejects(() =>
    uploadVoice(p, actor, c.id, key, encodeVoiceWav(new Float32Array(8000), 8000)),
  );
  let denied = false;
  try {
    const direct = await db.find({
      collection: "support-voice-audio",
      overrideAccess: false,
      user: null,
    });
    denied = direct.totalDocs === 0;
  } catch (e) {
    denied = (e as any).status === 403;
  }
  assert.equal(denied, true);
  const message = (
    await db.find({
      collection: "support-messages",
      where: { voiceAudio: { equals: first.audio } },
      limit: 1,
    })
  ).docs[0];
  await assert.rejects(() =>
    queueVoiceJob(p, actor, {
      conversation: c.id,
      message: message.id,
      kind: "transcribe",
      consent: false,
      key: randomUUID(),
    }),
  );
  const input = {
    conversation: c.id,
    message: message.id,
    kind: "transcribe",
    consent: true,
    key: randomUUID(),
  };
  const job = await queueVoiceJob(p, actor, input);
  assert.equal((await queueVoiceJob(p, actor, input)).job, job.job);
  await runVoiceJob(p, {
    run: async (request) => {
      assert.equal(request.audio, Buffer.from(wav).toString("base64"));
      return { text: "I need a cleaner next Tuesday" };
    },
  });
  assert.equal((await readVoiceJob(p, actor, job.job)).status, "succeeded");
  assert.equal(
    (await db.findByID({ collection: "support-messages", id: message.id })).voiceTranscript,
    "I need a cleaner next Tuesday",
  );
  await p.update({ collection: "support-conversations", id: c.id, data: { aiConsent: true } });
  const j2 = await queueVoiceJob(p, actor, { ...input, key: randomUUID() });
  await runVoiceJob(p, {
    run: async () => {
      await p.update({ collection: "support-conversations", id: c.id, data: { aiConsent: false } });
      return { text: "late transcript" };
    },
  });
  assert.equal((await readVoiceJob(p, actor, j2.job)).status, "discarded");
  await p.update({ collection: "support-conversations", id: c.id, data: { aiConsent: true } });
  const textMessage = await db.create({
    collection: "support-messages",
    data: {
      conversation: c.id,
      dedupe: randomUUID(),
      author: "staff",
      visibility: "public",
      text: "Hello, how can we help?",
    },
  });
  const synthesis = await queueVoiceJob(p, actor, {
    conversation: c.id,
    message: textMessage.id,
    kind: "synthesize",
    consent: true,
    key: randomUUID(),
  });
  await runVoiceJob(p, { run: async () => ({ audio: Buffer.from(wav).toString("base64") }) });
  const spoken = await readVoiceJob(p, actor, synthesis.job);
  assert.equal(spoken.status, "succeeded");
  assert.ok(spoken.audio);
  assert.equal((await readVoice(p, actor, spoken.audio as number)).seconds, 1);
  // Four jobs/minute reached: a fresh conversation exercises sensitive handoff and budget failures independently.
  const h = randomUUID(),
    s = await visitorAction(p, h, {
      action: "start",
      key: randomUUID(),
      locale: "en",
      topic: "general",
      aiConsent: true,
    });
  const a = await uploadVoice(p, { hash: h }, s.id, randomUUID(), wav);
  const m = (
    await db.find({
      collection: "support-messages",
      where: { voiceAudio: { equals: a.audio } },
      limit: 1,
    })
  ).docs[0];
  const sensitive = await queueVoiceJob(
    p,
    { hash: h },
    { conversation: s.id, message: m.id, kind: "transcribe", consent: true, key: randomUUID() },
  );
  await runVoiceJob(p, { run: async () => ({ text: "My door code is 9876" }) });
  assert.equal((await readVoiceJob(p, { hash: h }, sensitive.job)).status, "succeeded");
  assert.equal(
    (await p.findByID({ collection: "support-conversations", id: s.id })).mode,
    "waiting",
  );
  const budget = await queueVoiceJob(
    p,
    { hash: h },
    { conversation: s.id, message: m.id, kind: "transcribe", consent: true, key: randomUUID() },
  );
  process.env.SUPPORT_SPEECH_DAILY_UNITS = "1";
  await runVoiceJob(p, {
    run: async () => {
      throw Error("Budget must prevent provider request");
    },
  });
  assert.equal((await readVoiceJob(p, { hash: h }, budget.job)).status, "failed");
  console.log(
    "PASS voice private ownership, idempotency, PCM validation, durable speech jobs, synthesis playback, consent fencing, privacy handoff and budget reservation",
  );
} finally {
  await p.updateGlobal({
    slug: "support-settings",
    data: {
      voiceMessages: settings.voiceMessages,
      transcription: settings.transcription,
      speechPlayback: settings.speechPlayback,
      voiceMaxSeconds: (settings as any).voiceMaxSeconds,
      voiceMaxBytes: (settings as any).voiceMaxBytes,
      voiceUploadsPerMinute: (settings as any).voiceUploadsPerMinute,
    } as any,
  });
  for (const [key, value] of Object.entries({
    SUPPORT_SPEECH_ENDPOINT: env.endpoint,
    SUPPORT_SPEECH_KEY: env.key,
    SUPPORT_SPEECH_DAILY_UNITS: env.budget,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await p.destroy();
}
process.exit(0);
