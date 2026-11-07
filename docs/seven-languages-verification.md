# Seven-language local verification — 2026-10-28

Supported website and service-language codes: zh, en, es, fr, de, it, ar.

Implemented: seven-language navigation, page titles, public catalog/knowledge interface, enquiry and partner forms, validation and status messages; Arabic HTML direction; content-language filters/editor and explicit AI translation targets; exact-language public APIs, sitemap, media visibility; additive database enum migration. Existing service-language capability selections are unchanged.

Published translations are independent records sharing a content key. Detail-page language switching resolves the target slug by identity. An unpublished translation displays an explicit notice instead of pretending another language is translated. Existing editorial articles and six project drafts have not been bulk translated or automatically published. Admin navigation remains Chinese.

Verification:

- 43 unit tests passed.
- TypeScript and production build passed.
- Clean isolated-database migration passed; primary local schema extended additively.
- AI task integration passed, including explicit translation target validation.
- Seven-language database draft/publication isolation and enquiry persistence passed using fictional fixtures. All test publications withdrawn.
- HTTP: 42 pages, 14 public API locale checks, unsupported locale rejection passed (`node scripts/check-locales-http.mjs`).
- Browser: Arabic catalogue has RTL layout and localized seven-language filters; enquiry page uses localized messages; backend content and service language options expose all seven.

Local app restarted on http://127.0.0.1:3000. No external deployment or live model calls.
