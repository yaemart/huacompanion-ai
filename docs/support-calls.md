# Realtime support calls

Calls are disabled until the corresponding `support-settings` feature is enabled and a compatible real media gateway is configured. The application does not contain a pretend speech model or a fake production media server. Tests alone use a fake gateway.

## Required production service

Deploy a WebRTC media gateway implementing the contract below. It must bridge AI speech sessions and human audio, produce captions, have publicly reachable ICE candidates (including relay support for restrictive networks), and independently enforce session expiration, participant identity and maximum runtime. Configure:

- `SUPPORT_CALL_GATEWAY_URL`: HTTPS origin/base path, no embedded credentials.
- `SUPPORT_CALL_GATEWAY_KEY`: secret server-only gateway credential.
- `SUPPORT_CALL_MAX_SECONDS`: integer 30–1800, including queue time.
- `SUPPORT_CALL_CONCURRENCY`: integer 1–100.
- `SUPPORT_CALL_DAILY_SECONDS`: integer max 864000, at least one max-duration session. Full duration is reserved at creation, never refunded, preventing reconnect/retry budget bypass. Queue time is included and reservations are never refunded.
- `SUPPORT_CALL_MAX_CENTS_PER_MINUTE`: verified upper-bound gateway charge rate, integer 1–100000.
- `SUPPORT_CALL_DAILY_CENTS`: daily monetary cap, integer up to 10000000 and enough for one session. Every session conservatively reserves `ceil(maxSeconds / 60 * rate)`; the gateway must enforce the supplied `maxCostCents` across reconnects and transfers.
- `SUPPORT_CALL_AI_ENABLED=true`: only after the gateway's realtime speech model, speech recognition and synthesis are configured and tested.

The server sends `Authorization: Bearer <secret>` and JSON. No gateway secret or session bearer token is returned to browser list APIs. Browser signaling is proxied through authenticated same-origin routes and every operation revalidates the visitor's conversation ownership or employee's scoped conversation access. Session UUIDs remain server-side. SDP replies are private to the requesting participant.

## Gateway protocol v1

All operations are under `<base>/v1/`. Requests have an eight-second deadline. HTTPS redirects are rejected. The gateway must make operations idempotent and enforce `expiresAt` even if the application is offline.

`POST calls/{uuid}/offer` creates or updates one participant's WebRTC connection. JSON contains `participant` (`visitor` or `staff-{id}`), `kind` (`ai` / `human`), `locale`, `expiresAt` (absolute ISO timestamp), `maxSeconds`, `maxCostCents`, `aiConsent`, `recording=false`, `context` (trusted instructions and published-only sources for AI calls), `sdp` (full gathered offer). Return `{ "sdp": "v=0..." }` with the complete SDP answer, including gateway public/relay ICE candidates. Never accept browser-direct authorization using these participant names. The server checks staff claim ownership before forwarding. Repeated offers replace only that participant's transport; they never extend expiration or create another billable call. AI media processing requires `aiConsent=true`. Browser uses non-trickle ICE, audio-only tracks and a `captions` data channel. Send UTF-8 JSON `{ "type": "caption", "text": "..." }`; captions are displayed locally, not saved as verified text messages. Gateway may negotiate speech recognition/translation according to configured language; no local automatic translation is claimed.

`GET calls/{uuid}` returns `{ "connectedParticipants": ["visitor", "staff-42"], "aiConnected": true, "ended": false }`. **Only report connected identities once DTLS/SRTP is actually established.** Application changes conversation mode to human only after this server-authenticated proof. Client-side `accept` and WebRTC offer success alone never prove human arrival. Gateway must stop AI output atomically when the human joins, preventing competing responses.

`POST calls/{uuid}/handoff` receives `{ "retainAIUntilStaffConnected": true }`. Keep the existing AI transport/audio until a staff participant actually joins. New staff offers may specify `kind=human`; changing kind must not prematurely stop AI. The application keeps conversation mode unchanged until joined proof.

`DELETE calls/{uuid}/participants/staff-{id}` revokes and disconnects that staff participant; return 204 even if absent. This is required for declined claims, 30-second claim timeouts and transfers. New participant connections must not reuse revoked transports.

`DELETE calls/{uuid}` revokes all transports, stops AI processing/billing and removes the call. Return 204 if missing, or 200 with optional final `{ "summary": "...", "transcript": "..." }`. Repeat deletion must return the same final text for reliable retry. Summary is limited to 1500 characters and transcript to 5000; oversized text is discarded. The application saves this once as an internal, explicitly unconfirmed automatic note for staff review; it never books services or replaces customer confirmation. No audio recording is requested or stored. Failed cleanup remains pending and the worker retries; independent gateway expiration is mandatory.

No webhook trusts client-supplied join events. The authenticated gateway status endpoint is the sole proof source.

## Application lifecycle

- Customer permits the microphone and starts an AI or human call. AI also requires stored AI consent. One live call per conversation; global concurrent and conservative daily reservation caps are enforced under the existing PostgreSQL advisory transaction lock.
- Staff publish available/busy/away/offline status, supported language codes and capacity (1–3). Heartbeats expire after 45 seconds. The UI refreshes every 15 seconds. Fresh available presence matching the conversation's language and remaining capacity is required to claim; simultaneous claims serialize, and only one succeeds.
- Staff accept, decline, or transfer to the scoped queue. Declined staff cannot reclaim that session. An accepted claim expires after 30 seconds unless a gateway-confirmed join is observed. Presence going away stops new claims without dropping an existing call.
- Browser has audio playback, mute, hangup, ephemeral captions, and at most two reconnect attempts. Navigating away closes tracks and attempts hangup. The server and gateway deadlines cover lost tabs/network. All terminal transitions are idempotent.
- `runCallMaintenance(payload)` should run at least every ten seconds via the support worker; request handlers only maintain the returned call ID after call actions; presence heartbeats do not invoke global cleanup. It expires sessions, releases timed-out claims and retries gateway cleanup. Gateway deadlines remain the hard safety boundary when the worker is unavailable.

## Verification boundary

Unit tests cover limit validation, presence eligibility and privacy projections. Integration tests exercise the real application database and authenticated lifecycle against a deterministic fake gateway: isolation, feature gates, claims, no premature human takeover, hangup and expiration. The fake is restricted to test process fetch interception and is never selected by production configuration.

Production readiness still requires supplying a real compatible gateway and speech provider, then testing two physical browsers, microphone permissions, TURN/restricted NAT networks, actual AI audio, captions/languages, staff transfer, disconnect/reconnect and gateway-enforced duration/cost termination. These live checks cannot be claimed from local fake tests. Recording is not implemented or implied.

The AI bridge must support barge-in: use incoming live microphone audio for VAD, cancel in-flight speech generation on visitor speech, clear queued outgoing audio, and resume with the new utterance. The application sends uninterrupted live audio tracks (except user mute); this is a gateway requirement, not a browser simulation. Revoke/end must stop inference and synthesis as well as media forwarding. No paid media processing may continue after the absolute deadline. Numeric limits come from deployment environment, while global admin settings are feature switches; changing the switches does not edit those deployment limits.
