# Catalog implementation ledger

Base: bf40a40. User approved design and explicitly requested development.
Execution: inline in existing local project, preserving the established local preview/database workflow; no deployment.
Architecture: extend content kinds rather than create a second publishing system. Private provider binding stays outside public body.

Task 1: Typed catalog model and public projection completed. Unit tests observed failing before implementation; fee and source validation passed. Separate private providerRef fields and persistent suspended flag migrated. Publication requires eligible provider plus an explicit editorial check.
Task 2: Workbench kind/city/publication filters, structured catalog fields, admin-only provider name selector, two directory/detail routes, public read docs, JSON-LD and sitemap completed. Desktop and 390px mobile layout inspected.
Task 3: Source IDs enter validated input/hash. Server resolves them under the shared transaction lock and stores exact publication revision, private provider binding and required fulfilment providers. Invalid selections fail explicitly.
Final review: three important findings fixed: locale-scoped withdrawal; remount inquiry form when source changes; retain internal/versioned fulfilment snapshot. Regression tests observed failing then passing. No findings deferred.
Verification: 31 unit tests; catalog and content integration; 13 original backend checks; AI-task regression; catalog HTTP, content HTTP and 8 original HTTP checks passed. Empty database migration and backup restore passed. Browser confirmed invalid selection blocks form, then explicit removal enables a fresh general inquiry.
Scope: no deployment, no live AI call, no email delivery, no real provider/project publication. Fictional local test records retained as drafts/paused records.
