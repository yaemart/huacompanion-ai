# Exhibition phase-one verification — 2026-10-28

Implemented independent exhibition content and workbench, seven-language public directory/detail, city/industry/month/search/archive filters, edition-specific identities, official source and verification dates, optional media via existing blocks, related Hua projects, read-only API/docs, sitemap and identity-based language switching.

Publication requires admin review, explicit exhibitionReviewed and a source matching the official URL/verified date. Content and operational status remain distinct; cancelled/ended editions remain readable but cannot receive event-specific enquiries. Shanghai calendar date determines ended status. No schema migration required: existing versioned JSON content and source snapshot fields are reused.

Enquiry render reads publication consistently under the same lock as content writes. Submission requires the displayed publication revision, revalidates current publication/status and service compatibility, and stores authoritative dates/city/title/revision rather than trusting client metadata. Changing/removing an exhibition resets the form session. Idempotent accepted submissions remain retryable after withdrawal.

Verification:

- 52 unit tests passed; TypeScript and production build passed.
- tests/integration/exhibitions.ts passed: draft privacy, editor rejection, publication review/source checks, seven-locale isolation, authoritative snapshot, revision changes, service compatibility, status/withdrawal and idempotency.
- tests/integration/exhibitions-http.ts passed: list/detail and safe JSON-LD, public APIs, sitemap, enquiry prefill/revision, authenticated preview boundary, seven language routes, cancellation and withdrawal. Fictional published fixtures withdrawn in finally.
- Authenticated workbench and preview returned 200; six editorial drafts present; none publicly exposed.
- Browser confirmed Chinese exhibition navigation, filters and empty state. Existing browser admin session had expired, so authenticated backend verification used the local admin HTTP session without printing credentials.

Seeded three bilingual editorial drafts, never overwriting existing records or publishing:

- CIHF 2027: https://www.hardware-fair.com/p/Introduction.html
- CIHS 2027: https://www.hardwareshow-china.com/about/ and venue https://www.hardwareshow-china.com/about/100.html
- Canton Fair 140 / Phase 1 / 2026 (archive): https://is.mofcom.gov.cn/ExhibitionInfo/art/2026/art_b6ce9bedf8f04544b62fa44ed0f5add0.html ; venue address https://365.cantonfair.org.cn/

Source reading recorded 2026-10-28. Operator must reconfirm edition-specific admission/entrances and Hua availability before publication. No organizer relationship, admission guarantee or service capability was invented. Upcoming content in other languages remains unpublished until translated and reviewed.

Phase two (AI extraction/monitoring, multi-exhibition itineraries and conversion analytics) is not implemented. No external deployment, live model call, customer notification or third-party submission occurred.
