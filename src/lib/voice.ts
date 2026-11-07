export const MAX_VOICE_BYTES = 6_000_000;
export const MAX_VOICE_SECONDS = 60;
/** Strict PCM WAV subset: no codecs, metadata, playlists or claimed duration. */
export function inspectVoiceWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (a: number, n: number) => String.fromCharCode(...bytes.subarray(a, a + n));
  if (
    bytes.length < 44 ||
    bytes.length > MAX_VOICE_BYTES ||
    str(0, 4) !== "RIFF" ||
    str(8, 4) !== "WAVE" ||
    v.getUint32(4, true) !== bytes.length - 8
  )
    throw Error("Invalid WAV audio");
  let offset = 12,
    fmt = false,
    data = 0,
    rate = 0,
    align = 0;
  while (offset + 8 <= bytes.length) {
    const kind = str(offset, 4),
      size = v.getUint32(offset + 4, true);
    offset += 8;
    if (offset + size > bytes.length) throw Error("Truncated WAV");
    if (kind === "fmt ") {
      if (fmt || size !== 16 || v.getUint16(offset, true) !== 1) throw Error("PCM WAV required");
      fmt = true;
      const channels = v.getUint16(offset + 2, true);
      rate = v.getUint32(offset + 4, true);
      align = v.getUint16(offset + 12, true);
      if (
        channels !== 1 ||
        rate < 8000 ||
        rate > 48000 ||
        align !== 2 ||
        v.getUint16(offset + 14, true) !== 16 ||
        v.getUint32(offset + 8, true) !== rate * align
      )
        throw Error("Mono 16-bit PCM required");
    } else if (kind === "data") {
      if (!fmt || data || !size || size % 2) throw Error("Invalid audio data");
      data = size;
    } else throw Error("Unsupported WAV chunk");
    offset += size + (size % 2);
  }
  const seconds = data / (rate * align);
  if (offset !== bytes.length || !fmt || !data || seconds < 0.1 || seconds > MAX_VOICE_SECONDS)
    throw Error("Audio must be 0.1–60 seconds");
  return { seconds, rate, mime: "audio/wav" as const };
}
export function encodeVoiceWav(samples: Float32Array, rate: number) {
  const b = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(b);
  const put = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  put(0, "RIFF");
  v.setUint32(4, b.byteLength - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) =>
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767), true),
  );
  return new Uint8Array(b);
}
