"use client";
import { voiceCopy } from "../../lib/voice-copy";
import { useEffect, useState } from "react";
import type { Locale } from "../../lib/locales";
export function VoiceMessage({
  audio,
  staff = false,
  locale,
}: {
  audio: number;
  staff?: boolean;
  locale: Locale;
}) {
  return (
    <audio
      aria-label={voiceCopy(locale).message}
      controls
      preload="none"
      src={`/api/support/voice?audio=${audio}${staff ? "&staff=1" : ""}`}
    />
  );
}
export function VoiceSpeechAction({
  conversation,
  message,
  kind,
  staff = false,
  locale,
  onDone,
}: {
  conversation: number;
  message: number;
  kind: "transcribe" | "synthesize";
  staff?: boolean;
  locale: Locale;
  onDone?: () => void;
}) {
  const t = voiceCopy(locale);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<number | null>(null),
    [audio, setAudio] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch(`/api/support/voice/jobs?job=${job}${staff ? "&staff=1" : ""}`);
        const v = await r.json();
        if (!r.ok) throw Error(v.error);
        if (stopped) return;
        if (v.status === "succeeded") {
          setJob(null);
          setBusy(false);
          setAudio(v.audio);
          onDone?.();
        } else if (["failed", "discarded"].includes(v.status))
          throw Error(v.error || "Speech processing failed");
        else timer = setTimeout(poll, 2500);
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setJob(null);
          setBusy(false);
        }
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job, staff, onDone]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/support/voice/jobs${staff ? "?staff=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation, message, kind, consent, key: crypto.randomUUID() }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      setJob(v.job);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {t.consent}
      </label>
      <button type="button" disabled={!consent || busy} onClick={() => void submit()}>
        {busy ? t.processing : kind === "transcribe" ? t.transcribe : t.synthesize}
      </button>
      {audio && <VoiceMessage audio={audio} staff={staff} locale={locale} />}
      <p role="status">{error}</p>
    </div>
  );
}
export default VoiceMessage;
