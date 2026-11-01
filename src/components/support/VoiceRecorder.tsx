"use client";
import { voiceCopy } from "../../lib/voice-copy";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../lib/locales";
import { encodeVoiceWav, MAX_VOICE_SECONDS } from "../../lib/voice";
export function VoiceRecorder({
  conversation,
  staff = false,
  locale,
  onSent,
}: {
  conversation: number;
  staff?: boolean;
  locale: Locale;
  onSent?: () => void;
}) {
  const t = voiceCopy(locale);
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [clip, setClip] = useState<Uint8Array | null>(null),
    [preview, setPreview] = useState("");
  const cleanup = useRef<(() => void) | null>(null),
    stopRef = useRef<(() => void) | null>(null),
    key = useRef(""),
    generation = useRef(0),
    starting = useRef(false);
  useEffect(() => {
    generation.current++;
    setClip(null);
    setRecording(false);
    setPending(false);
    starting.current = false;
    return () => {
      generation.current++;
      cleanup.current?.();
      cleanup.current = null;
      stopRef.current = null;
    };
  }, [conversation]);
  useEffect(() => {
    if (!clip) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(clip)], { type: "audio/wav" }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  async function start() {
    if (starting.current || recording || busy) return;
    starting.current = true;
    setPending(true);
    setError("");
    setClip(null);
    const current = generation.current;
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    let localCleanup: (() => void) | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: false,
      });
      if (current !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new AudioContext();
      const rate = context.sampleRate;
      if (rate > 48000 || rate < 8000) throw Error(t.unsupported);
      const source = context.createMediaStreamSource(stream),
        node = context.createScriptProcessor(4096, 1, 1),
        gain = context.createGain();
      gain.gain.value = 0;
      const parts: Float32Array[] = [];
      let count = 0,
        stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = rate * MAX_VOICE_SECONDS;
      const close = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        node.onaudioprocess = null;
        node.disconnect();
        source.disconnect();
        gain.disconnect();
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
      };
      cleanup.current = close;
      localCleanup = close;
      const stop = () => {
        if (stopped) return;
        close();
        setRecording(false);
        if (current !== generation.current) return;
        if (count < Math.ceil(rate * 0.1)) {
          setError(t.tooShort);
          return;
        }
        const samples = new Float32Array(count);
        let pos = 0;
        parts.forEach((part) => {
          samples.set(part, pos);
          pos += part.length;
        });
        setClip(encodeVoiceWav(samples, rate));
        key.current = crypto.randomUUID();
      };
      stopRef.current = stop;
      node.onaudioprocess = (e) => {
        if (stopped) return;
        const part = e.inputBuffer.getChannelData(0).slice(0, limit - count);
        parts.push(part);
        count += part.length;
        if (count >= limit) stop();
      };
      source.connect(node);
      node.connect(gain);
      gain.connect(context.destination);
      await context.resume();
      if (current !== generation.current) {
        close();
        return;
      }
      timer = setTimeout(stop, MAX_VOICE_SECONDS * 1000);
      setRecording(true);
    } catch (e) {
      localCleanup?.();
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close();
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        starting.current = false;
        setPending(false);
      }
    }
  }
  async function send() {
    if (!clip || busy) return;
    setBusy(true);
    setError("");
    const current = generation.current;
    try {
      const response = await fetch(
        `/api/support/voice?conversation=${conversation}${staff ? "&staff=1" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "audio/wav", "Idempotency-Key": key.current },
          body: new Blob([new Uint8Array(clip)], { type: "audio/wav" }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (current === generation.current) {
        setClip(null);
        onSent?.();
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="support-voice-recorder">
      <button
        type="button"
        disabled={busy || pending}
        onClick={() => (recording ? stopRef.current?.() : void start())}
      >
        {pending ? t.microphonePending : recording ? t.stop : t.record}
      </button>
      {clip && (
        <>
          {preview && <audio controls preload="metadata" aria-label={t.preview} src={preview} />}
          <button type="button" disabled={busy} onClick={() => void send()}>
            {busy ? t.sending : t.send}
          </button>
          <button type="button" disabled={busy} onClick={() => setClip(null)}>
            {t.cancel}
          </button>
        </>
      )}
      {recording && <span role="status">{t.recording}</span>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default VoiceRecorder;
