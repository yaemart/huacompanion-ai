# Support operations

The staff desk can mount `SupportOperations` with the selected conversation ID. The visitor chat can mount the named `SupportSatisfaction` component when a conversation is resolved. Register `operationsCollections` in Payload and append `operationsSettingsFields` to `support-settings` before generating types and migrations.

## Permissions and reports

`GET /api/support/operations` authenticates staff and reads conversations through the existing ownership/team access policy. Child records are loaded only for those conversation IDs. Administrators see all conversations and retention history. Other operators receive only their authorized data. Direct CMS access to feedback/review/audit records is administrator-only; direct create/update/delete is denied. The narrow routes authorize mutations.

Counts cover all pages in the permitted scope and are lifetime values, not a date-range report. Waiting means unresolved and waiting for a human. Overdue means an unresolved conversation with a past follow-up date. First-response duration runs from the first public customer message to the first subsequent public staff/AI reply; greetings, system notices and internal notes do not count. Resolution duration runs from the first customer message to the most recent explicit internal `resolve` event for a currently resolved conversation. Mutable conversation update timestamps are never substituted. Both averages show sample counts; unanswered conversations and resolved conversations lacking event evidence are separately counted. Retention-redacted historical resolve events cannot yield resolution duration and remain unknown. AI task duration is independently creation-to-terminal-update, including queuing, not provider latency. AI token reserves and reported usage are distinct. Missing usage is counted explicitly and no financial cost is inferred. Speech reserves distinguish transcription seconds from synthesis characters; call reservations are seconds, not measured duration or charges. Feature state reports configuration readiness, not external uptime; no diagnostic request is sent to a provider. Counts of queued/running jobs, expired AI leases, and pending call cleanup expose actionable worker/service conditions.

Recent run lists exclude raw provider errors; authorized administrators can inspect the private task records. Quality reviews and knowledge-gap notes retain author identity internally and never modify the published knowledge base automatically.

## Feedback and review

`POST /api/support/operations/feedback` accepts `{id,rating,comment?}`. It checks the existing visitor cookie ownership, requires a resolved conversation, validates a 1–5 rating, and allows one immutable response per conversation. An identical retry succeeds; changed feedback conflicts. Comments are limited to 2,000 characters.

`POST /api/support/operations` with `{action:"review",id,key,category,note}` checks staff conversation scope. Categories: `knowledge-gap`, `quality`, `follow-up`. A request key deduplicates retries. Notes are limited to 2,000 characters. Same-origin checks protect both write routes.

## Retention

Administrators separately configure `textRetentionDays`, `audioRetentionDays`, and `transcriptRetentionDays` (1–3650 days). `retentionDeletionEnabled` defaults to false. No scheduled deletion is enabled.

1. POST `{action:"preview",kind:"text"|"audio"|"transcript"}`. An administrator-only audit stores candidate IDs, policy, actor and a ten-minute preview token. This changes no conversation content.
2. Review counts and the policy. Enable deletion in the administrator settings only when intended.
3. POST `{action:"execute",kind,token,confirm:"DELETE SUPPORT CONTENT"}`. The same administrator must explicitly confirm. Expired previews or changed retention days require another preview. The server rechecks current eligibility and processes only IDs from the original preview. Newly eligible data cannot silently enter the deletion set. Repeated execution returns the stored result.

Eligibility requires a resolved conversation older than the relevant retention period, no queued/running AI or speech jobs, no queued/connecting/active calls or pending remote call cleanup, and every linked inquiry having status `closed`. Missing linked inquiries are conservatively retained. These checks and mutations use the shared support transaction/advisory lock. Text cleanup preserves the conversation activity timestamp when clearing summary/draft fields, so it cannot postpone audio or transcript retention. The installed Payload Local API always overwrites `updatedAt`; this specific internal write uses `p.db.updateOne` with the existing timestamp under the same transaction, changing only summary, proposed request and the preserved timestamp. No general adapter-write endpoint is exposed.

Text cleanup replaces message text with a retention marker; clears citations, summaries, proposed requests, AI task/error fields, speech errors, feedback comments and review note text. IDs, numeric usage, ratings, conversation identity and audit evidence remain. Audio cleanup clears message/job references before deleting the private database audio rows. Transcript cleanup clears `voiceTranscript` and also redacts internal `call-summary:` messages containing the gateway’s combined automatic summary/transcript. These combined messages are subject to whichever text or transcript cleanup executes first. Each category has its own policy; deleting audio does not delete transcription, and text cleanup does not clear dedicated voice transcription; combined call summary/transcript messages are redacted by either applicable policy. Existing messages' `updatedAt` is not used to override the conversation age guard.

No inquiry, customer or conversation is deleted. This is support-content retention, not a full personal-data erasure workflow. Audio storage is private database content; the cleanup never removes arbitrary filesystem files or contacts external gateways. Call media lifecycle remains with the call service.

## Verification

`node --experimental-strip-types --test tests/support-operations.test.ts` runs the in-memory integration fixture in `tests/integration/support-operations.ts`. It checks scope isolation, satisfaction ownership/deduplication, review deduplication, token accounting, default-disabled deletion, explicit confirmation, active inquiry/call protection, audit records and preservation of conversations/inquiries. It connects to no database and changes no real records. Run project typecheck after integration and generated schema updates.

`npx tsx tests/integration/support-operations-db.ts` additionally verifies the actual Payload/Postgres adapter preserves the activity timestamp and that sequential text/audio/transcript policies remain independent. Run serially against the local fixture database. Every write runs in a single transaction that is rolled back, including settings and audit rows; the suite checks each preview contains exactly its own fixture IDs before executing any cleanup. It then verifies settings restoration and fixture absence after rollback. It requires an existing active local administrator and fails closed if unrelated candidates exist.
