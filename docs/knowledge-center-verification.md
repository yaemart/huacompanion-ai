# Knowledge centre verification — 2026-10-27

Implemented eight shared sections across the public knowledge centre, content workbench filters and native draft-list labels. Public guides support search, section URLs, related articles and publication dates. The read-only /api/public/content endpoint exposes active sanitized publication snapshots with language, section and page filtering. Published-content reads traverse database pages rather than truncating at 1,000 records.

Seeded 32 checklist topics (four per section), each in Chinese and English: 64 new drafts. Business and hardware/electrical visit preparation is prioritized. Drafts contain actionable preparation steps and service boundaries. Sources remain empty pending verification; none were approved or published. Re-running seed:knowledge created zero duplicates.

Verification:
- 27 unit tests passed.
- Production build and TypeScript checks passed.
- Empty isolated database migrations passed.
- Content integration checks passed, including multi-page published reads.
- HTTP checks passed for authentication, draft privacy, publication snapshots, language isolation, public API publication/unpublication, invalid locale and media access.
- Browser check: eight section cards render; clearing a business section removes the URL filter; reload retains all-content selection. Desktop screenshot inspected.
- Independent review findings (filter URL mismatch and 1,000-record truncation) addressed.

Limitations: this is a local development release. No new editorial content has been source-verified or published. No live AI provider calls, external publishing or deployment performed. Agent readers can only access the local endpoint from an environment that can reach this machine until hosting is configured.
