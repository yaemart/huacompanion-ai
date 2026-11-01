import test from "node:test";
import assert from "node:assert/strict";
import { encodeVoiceWav, inspectVoiceWav } from "../src/lib/voice.ts";
test("WAV duration is derived from server-parsed sample bytes", () => {
  const wav = encodeVoiceWav(
    new Float32Array(16000).map((_, i) => Math.sin(i / 10) * 0.2),
    16000,
  );
  assert.deepEqual(inspectVoiceWav(wav), { seconds: 1, rate: 16000, mime: "audio/wav" });
});
test("reject truncated, oversized-duration, forged rate and non-PCM audio", () => {
  const wav = encodeVoiceWav(new Float32Array(16000), 16000);
  assert.throws(() => inspectVoiceWav(wav.subarray(0, 100)));
  for (const [offset, value] of [
    [20, 3],
    [22, 2],
    [32, 4],
    [34, 8],
  ]) {
    const bad = wav.slice();
    new DataView(bad.buffer).setUint16(offset, value, true);
    assert.throws(() => inspectVoiceWav(bad));
  }
  assert.throws(() => inspectVoiceWav(encodeVoiceWav(new Float32Array(16000 * 61), 16000)));
  assert.throws(() => inspectVoiceWav(new TextEncoder().encode("not audio")));
});
