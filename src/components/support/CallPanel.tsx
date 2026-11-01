"use client";
import { acquireCallMedia, settleCallAction } from "../../lib/callLifecycle";
import { callLabels } from "../../lib/callLabels";
import { useCallback, useEffect, useRef, useState } from "react";
type Props = { conversation: any; staff?: boolean; locale?: string };
async function request(staff: boolean, body: any) {
  const response = await fetch("/api/support/calls" + (staff ? "/staff" : ""), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Call unavailable");
  return data;
}
function iceComplete(pc: RTCPeerConnection) {
  return new Promise<void>((resolve, reject) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      reject(Error("Network negotiation timed out"));
    }, 8000);
    function check() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}
export function CallPanel({ conversation, staff = false, locale = "en" }: Props) {
  const t = callLabels(locale);
  const [features, setFeatures] = useState<any>(null);
  const [call, setCall] = useState<any>(null),
    [error, setError] = useState(""),
    [phase, setPhase] = useState(""),
    [muted, setMuted] = useState(false),
    [caption, setCaption] = useState(""),
    [busy, setBusy] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    current = useRef<any>(null),
    attempts = useRef(0),
    generation = useRef(0),
    retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    statusBusy = useRef(false),
    mounted = useRef(false),
    lifecycle = useRef(0),
    ownedCall = useRef<any>(null);
  const id = typeof conversation === "object" ? conversation?.id : conversation;
  const cleanup = useCallback(() => {
    generation.current++;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (audio.current) audio.current.srcObject = null;
    if (mounted.current) {
      setPhase("");
      setMuted(false);
    }
  }, []);
  const act = useCallback(
    (action: string, extra: object = {}) =>
      request(staff, { action, conversation: id, call: current.current?.id, ...extra }),
    [staff, id],
  );
  const update = useCallback((c: any) => {
    current.current = c;
    setCall(c);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const life = ++lifecycle.current;
    setCall(null);
    setFeatures(null);
    setBusy(false);
    let live = true;
    async function refresh() {
      try {
        const r = await fetch(`/api/support/calls${staff ? "/staff" : ""}?conversation=${id}`, {
          cache: "no-store",
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (live) {
          setFeatures(data.features);
        }
        if (live && !current.current) {
          const active = data.calls?.find((c: any) =>
            ["queued", "connecting", "active"].includes(c.state),
          );
          if (active) update(active);
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    }
    if (id) void refresh();
    return () => {
      live = false;
      mounted.current = false;
      lifecycle.current++;
      const c = ownedCall.current || current.current;
      const participating = !!ownedCall.current;
      const endAction = staff && !pc.current ? "reject" : "hangup";
      cleanup();
      current.current = null;
      ownedCall.current = null;
      if ((!staff || participating) && c && ["queued", "connecting", "active"].includes(c.state))
        void request(staff, { action: endAction, conversation: id, call: c.id }).catch(() => {});
    };
  }, [id, staff, cleanup, update]);
  function alive(life: number) {
    return mounted.current && lifecycle.current === life;
  }
  async function release(c: any, action = staff ? "reject" : "hangup") {
    await request(staff, { action, conversation: id, call: c.id }).catch(() => {});
  }
  async function connect(c: any, life = lifecycle.current) {
    if (!alive(life) || current.current?.id !== c.id) return;
    const ticket = ++generation.current;
    const valid = () =>
      alive(life) && ticket === generation.current && current.current?.id === c.id;
    setPhase(t.connecting);
    setError("");
    let localStream = stream.current;
    const acquired = !localStream;
    let peer: RTCPeerConnection | null = null;
    try {
      if (!localStream) {
        localStream = await acquireCallMedia(
          () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          valid,
        );
        if (!localStream) return;
      }
      if (!valid()) {
        if (acquired) localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = localStream;
      pc.current?.close();
      peer = new RTCPeerConnection();
      const connection = peer;
      pc.current = connection;
      ownedCall.current = c;
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream!));
      connection.ontrack = (e) => {
        if (valid() && audio.current) {
          audio.current.srcObject = e.streams[0] || new MediaStream([e.track]);
          void audio.current.play().catch(() => {
            if (valid()) setError(t.play);
          });
        }
      };
      const captions = connection.createDataChannel("captions");
      captions.onmessage = (e) => {
        if (!valid()) return;
        try {
          if (typeof e.data !== "string" || e.data.length > 10000) return;
          const data = JSON.parse(e.data);
          if (data.type === "caption" && typeof data.text === "string")
            setCaption(data.text.slice(0, 2000));
        } catch {}
      };
      connection.onconnectionstatechange = () => {
        if (!valid()) return;
        if (connection.connectionState === "connected") setPhase(t.connected);
        if (
          ["failed", "disconnected"].includes(connection.connectionState) &&
          !retryTimer.current
        ) {
          if (attempts.current >= 2) {
            setError(t.lost);
            cleanup();
            update({ ...c, state: "ended" });
            ownedCall.current = null;
            void release(c, "hangup");
            return;
          }
          attempts.current++;
          setPhase(t.reconnecting);
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            if (valid()) void connect(c, life);
          }, 1500);
        }
      };
      await connection.setLocalDescription(await connection.createOffer());
      if (!valid()) return;
      await iceComplete(connection);
      if (!valid()) return;
      const answer = await request(staff, {
        action: "offer",
        conversation: id,
        call: c.id,
        sdp: connection.localDescription!.sdp,
      });
      if (!valid()) return;
      await connection.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        cleanup();
        update(null);
        ownedCall.current = null;
        void release(c);
      } else {
        peer?.close();
        if (acquired && localStream && stream.current !== localStream)
          localStream.getTracks().forEach((track) => track.stop());
      }
    }
  }
  useEffect(() => {
    if (!call || !["queued", "connecting", "active"].includes(call.state)) return;
    const life = lifecycle.current;
    let live = true;
    const timer = setInterval(async () => {
      if (statusBusy.current || !alive(life)) return;
      statusBusy.current = true;
      const pollGeneration = generation.current;
      try {
        const c = await act("status");
        if (
          !live ||
          !alive(life) ||
          pollGeneration !== generation.current ||
          current.current?.id !== c.id
        )
          return;
        update(c);
        if (!["queued", "connecting", "active"].includes(c.state)) {
          cleanup();
          ownedCall.current = null;
        }
      } catch (e) {
        if (!live || !alive(life) || pollGeneration !== generation.current) return;
        setError((e as Error).message);
        if (current.current && Date.parse(current.current.expiresAt) <= Date.now()) {
          cleanup();
          update({ ...current.current, state: "expired" });
          ownedCall.current = null;
        }
      } finally {
        statusBusy.current = false;
      }
    }, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [call?.id, call?.state, act, cleanup, update]);
  async function start(kind: string) {
    const life = lifecycle.current;
    if (!alive(life)) return;
    setBusy(true);
    setError("");
    attempts.current = 0;
    try {
      const c = await settleCallAction(
        act("start", { kind, key: crypto.randomUUID() }),
        () => alive(life),
        (c) => release(c, "hangup"),
      );
      if (!c) return;
      ownedCall.current = c;
      update(c);
      await connect(c, life);
    } catch (e) {
      if (alive(life)) setError((e as Error).message);
    } finally {
      if (alive(life)) setBusy(false);
    }
  }
  async function accept() {
    const life = lifecycle.current;
    if (!alive(life)) return;
    setBusy(true);
    try {
      const c = await settleCallAction(
        act("accept"),
        () => alive(life),
        (c) => release(c, "reject"),
      );
      if (!c) return;
      ownedCall.current = c;
      update(c);
      await connect(c, life);
    } catch (e) {
      if (alive(life)) setError((e as Error).message);
    } finally {
      if (alive(life)) setBusy(false);
    }
  }
  async function finish(action = "hangup") {
    const life = lifecycle.current;
    if (!alive(life)) return;
    const target = current.current;
    setBusy(true);
    cleanup();
    try {
      const c = await request(staff, { action, conversation: id, call: target?.id });
      if (alive(life)) {
        ownedCall.current = null;
        update(action === "hangup" ? c : null);
      }
    } catch (e) {
      if (alive(life)) setError((e as Error).message);
    } finally {
      if (alive(life)) setBusy(false);
    }
  }
  async function handoff() {
    const life = lifecycle.current;
    if (!alive(life)) return;
    setBusy(true);
    try {
      const c = await act("handoff");
      if (alive(life)) update(c);
    } catch (e) {
      if (alive(life)) setError((e as Error).message);
    } finally {
      if (alive(life)) setBusy(false);
    }
  }
  const live = call && ["queued", "connecting", "active"].includes(call.state);
  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      aria-label={t.title}
      style={{ border: "1px solid #ddd", padding: 12, borderRadius: 12, margin: "12px 0" }}
    >
      <strong>{t.title}</strong>
      <p>
        {live
          ? call.state === "queued"
            ? t.waiting
            : call.state === "active"
              ? t.active
              : t.connecting
          : t.allow}
        {phase ? ` · ${phase}` : ""}
      </p>
      {!live && !staff && (
        <>
          {features?.aiCalls?.available && (
            <button disabled={busy} onClick={() => start("ai")}>
              {t.ai}
            </button>
          )}{" "}
          {features?.humanCalls?.available && (
            <button disabled={busy} onClick={() => start("human")}>
              {t.human}
            </button>
          )}
        </>
      )}
      {live && (
        <>
          {staff && !pc.current && (
            <>
              <button disabled={busy} onClick={accept}>
                {t.accept}
              </button>
              <button disabled={busy} onClick={() => finish("reject")}>
                {t.decline}
              </button>
            </>
          )}
          {!staff && !pc.current && (
            <button disabled={busy} onClick={() => connect(call)}>
              {t.connect}
            </button>
          )}
          <button
            disabled={!stream.current}
            onClick={() => {
              const next = !muted;
              stream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
              setMuted(next);
            }}
          >
            {muted ? t.unmute : t.mute}
          </button>
          {!staff && call.kind === "ai" && features?.humanCalls?.available && (
            <button disabled={busy} onClick={handoff}>
              {t.handoff}
            </button>
          )}
          <button disabled={busy} onClick={() => finish()}>
            {t.hangup}
          </button>
          {staff && pc.current && (
            <button disabled={busy} onClick={() => finish("transfer")}>
              {t.transfer}
            </button>
          )}
        </>
      )}
      <audio ref={audio} autoPlay controls style={{ maxWidth: "100%" }} />
      <p aria-live="polite">{caption}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function StaffCallQueue({ locale = "zh" }: { locale?: string }) {
  const t = callLabels(locale);
  const [state, setState] = useState("offline"),
    [languages, setLanguages] = useState(locale),
    [capacity, setCapacity] = useState(1),
    [calls, setCalls] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        await request(true, {
          action: "presence",
          state,
          languages: languages.split(",").map((x) => x.trim()),
          capacity,
        });
        const r = await fetch("/api/support/calls/staff", { cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (alive) setCalls(data.calls || []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void tick();
    const timer = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [state, languages, capacity]);
  return (
    <section>
      <h3>{t.queue}</h3>
      <label>
        {t.state}{" "}
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {["available", "busy", "away", "offline"].map((s) => (
            <option key={s} value={s}>
              {t[s as keyof typeof t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.languages}
        <input value={languages} onChange={(e) => setLanguages(e.target.value)} />
      </label>
      <label>
        {t.capacity}{" "}
        <input
          type="number"
          min={1}
          max={3}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {calls
        .filter((c) => c.kind === "human" && (c.state === "queued" || c.mine))
        .map((c) => (
          <div key={c.id}>
            {t.conversation} #{c.conversation}
            <CallPanel conversation={c.conversation} staff locale={locale} />
          </div>
        ))}
    </section>
  );
}
