# Business AI draft implementation

User authorizes continuous local completion; external accounts stay disabled and do not block other development.

## Design and scope

Extend the existing workbench rather than a new chat or autonomous sending agent. Private durable tasks contain a staff-confirmed, de-identified brief, target locale, and staff-authorized currency/fee rows. Model writes narrative and questions; authoritative amounts and quantities come exclusively from the supplied fee rows. No customer identities, original conversations, internal cost or provider contacts are automatically sent. Input/output size caps, timeout, reserved daily budget, lease fencing, no automatic retry after unknown charges. Production gateway is an optional explicitly enabled HTTPS JSON contract, with injected adapters only in tests.

Tasks are bound to current case revision and inquiry timestamp; permission/source changes invalidate results before adoption. Adoption creates an immutable AI-origin quote draft. Manager must review with a recorded reason before sending; rejection and cancellation remain private. Generated content is untrusted and escaped by React. Human reviewers own factual correctness and final availability. Actual model/email/hosting activation remains external work.

## Steps

- [x] Unit RED/GREEN: strict fees, response schema, configuration closed, source/version validation and send review gate.
- [x] Private task collection and AI quote provenance/review metadata; migration and generated types.
- [x] Scoped task actions, durable worker with timeout/budget/lease checks, editable adoption, explicit review/send gate.
- [x] Workbench interface and task status; existing workflow worker processes optional AI jobs.
- [x] Real DB integration: unconfigured, cancellation, expired lease, revoked access, stale source, adoption idempotency, unapproved send, approved send and customer privacy.
- [x] Build, migration, regressions, independent review and local runtime verification; document remaining external activation only.

Existing broad program (native Apps/store releases/cloud deployment) is not represented as completed by this local backend increment. Local scan found the missing business AI path; previous five-batch modules remain tested and preserved. Do not commit unrelated existing changes.

## Review and verification evidence

- Unit tests: 115/115; initial new module absent (RED), then new validation tests GREEN.
- Independent reviewer business_ai_review found two P2 issues: creator permission recheck at adoption; lease deadline fences. Added real DB regression scenarios; observed both failures, fixed both, observed GREEN.
- Added rejected-quote revision path: RED unknown action, then GREEN preserving AI provenance and resetting approval. Revisions create immutable new quotes; already human-adopted drafts are editable by currently authorized staff and remain subject to fresh manager review.
- Actual DB tests: AI pipeline, existing business flow, workflow, customer identities passed. Actual suppliers never contacted; all model results are injected test fixtures only.
- New incremental migration passes isolated empty database check. Backup restore now checks 42 database tables plus content media; verified backup `backups/local-1793425655492.dump`.
- Final production build and typecheck passed. Running HTTP tests passed (authentication, private collections, origin, disabled status, idempotency, queue refusal, cancel). Browser checked AI assistant, pending/rejected send buttons disabled and latest revision loaded into editable form. Worker --once exits successfully with model disabled.
- Product decision: same manager may prepare and later explicitly approve; two-person separation is not imposed. Approval is still a separate audited action. No autonomous pricing, sending or booking.
