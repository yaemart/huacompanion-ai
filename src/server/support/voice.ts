import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { ContentError } from "../content/service";
import { owned, scoped, supportTransaction, keyOf, append, updateConversation } from "./service";
import { requireSupportFeature } from "./features";
import { MAX_VOICE_BYTES, inspectVoiceWav } from "../../lib/voice";
import { relationID } from "../../cms/access";
export type VoiceActor = { hash: string; user?: never } | { user: any; hash?: never };
export const voiceScope = (p: Payload, actor: VoiceActor, id: unknown, req?: any) =>
  actor.user
    ? scoped(p, actor.user, id, req)
    : actor.hash
      ? owned(p, actor.hash, id, req)
      : Promise.reject(new ContentError("Session required", 403));
export async function boundedVoiceBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "audio/wav")
    throw new ContentError("audio/wav required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ContentError("Audio required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timer = setTimeout(() => void reader.cancel(), 15000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_VOICE_BYTES) {
        await reader.cancel();
        throw new ContentError("Audio too large", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}
export async function uploadVoice(
  p: Payload,
  actor: VoiceActor,
  conversation: unknown,
  key: unknown,
  bytes: Uint8Array,
) {
  let info;
  try {
    info = inspectVoiceWav(bytes);
  } catch (e) {
    throw new ContentError((e as Error).message, 415);
  }
  const db = p as any,
    digest = createHash("sha256").update(bytes).digest("hex");
  return supportTransaction(p, async (req) => {
    await requireSupportFeature(p, "voiceMessages", req);
    const c = await voiceScope(p, actor, conversation, req);
    const settings: any = await p.findGlobal({ slug: "support-settings", req });
    if (
      info.seconds > Math.min(60, settings.voiceMaxSeconds || 60) ||
      bytes.length > Math.min(MAX_VOICE_BYTES, settings.voiceMaxBytes || MAX_VOICE_BYTES)
    )
      throw new ContentError("Audio exceeds configured limits", 413);
    const dedupe = `voice:${c.id}:${actor.user ? "staff:" + actor.user.id : "visitor"}:${keyOf(key)}`;
    const old = (
      await db.find({
        collection: "support-voice-audio",
        where: { dedupe: { equals: dedupe } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (old) {
      if (old.digest !== digest) throw new ContentError("Request key conflict", 409);
      return { audio: old.id, seconds: old.seconds };
    }
    const recent = await db.count({
      collection: "support-voice-audio",
      where: {
        and: [
          { conversation: { equals: c.id } },
          { createdAt: { greater_than: new Date(Date.now() - 60000).toISOString() } },
        ],
      },
      req,
    });
    const total = await db.count({
      collection: "support-voice-audio",
      where: { conversation: { equals: c.id } },
      req,
    });
    if (
      recent.totalDocs >= Math.min(4, settings.voiceUploadsPerMinute || 4) ||
      total.totalDocs >= 100
    )
      throw new ContentError("Voice message limit reached", 429);
    const audio = await db.create({
      collection: "support-voice-audio",
      data: {
        conversation: c.id,
        dedupe,
        digest,
        body: Buffer.from(bytes).toString("base64"),
        seconds: info.seconds,
      },
      req,
    });
    await append(
      p,
      c,
      {
        dedupe,
        author: actor.user ? "staff" : "customer",
        staff: actor.user?.id,
        visibility: "public",
        text: "🎤",
        voiceAudio: audio.id,
      },
      req,
    );
    await updateConversation(
      p,
      c,
      actor.user ? { mode: "human", status: "waiting-customer" } : { status: "open" },
      req,
      true,
    );
    return { audio: audio.id, seconds: info.seconds };
  });
}
export async function readVoice(p: Payload, actor: VoiceActor, id: number) {
  const audio = await (p as any).findByID({
    collection: "support-voice-audio",
    id,
    depth: 0,
    overrideAccess: true,
  });
  await voiceScope(p, actor, relationID(audio.conversation));
  return { bytes: Buffer.from(audio.body, "base64"), seconds: audio.seconds };
}
