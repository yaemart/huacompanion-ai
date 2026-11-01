# Exhibition directory — approved phase-one implementation

User approved implementation of phase one: independent exhibition content, CMS review/publish, seven-language list/detail, official sources/verification dates, status/archive, related Hua projects, unified enquiry attribution and read-only Agent API. Local only; no external deployment. AI retrieval/monitoring/multi-show planning/statistics remain phase two.

Shared contract:

- ContentBody.kind adds `exhibition`; optional `exhibition: Exhibition`.
- Exhibition: edition, city, venue, address, addressEn, startDate, endDate, audience, exhibits, admission, officialURL, registrationURL, verifiedAt, unresolved: strings; industries:string[]; status: pending|announced|postponed|cancelled|ended; projectKeys:string[].
- Cities reuse catalogCities. industry codes: hardware,electrical,machinery,electronics,building,consumer,other.
- Date strings YYYY-MM-DD; blank dates allowed only for pending/postponed, never partial; ended inferred after endDate in Asia/Shanghai without overwriting explicit cancellation/postponement. Publication requires official source + verification and usable customer information. No invented verified status or AI publication.
- library exports Exhibition, emptyExhibition, validateExhibition(e,publishing=false), publicExhibition(e), effectiveExhibitionStatus(e, today?), filterExhibitions(items,filters,today?), exhibitionPath(body).
- Exhibition public UI receives locale/items/detail?/query?/languagePaths?; links `/[locale]/exhibitions` and `/[locale]/exhibitions/[slug]`.
- Enquiries extend existing CatalogSource with exhibition?:publicContentKey; current publication revalidated under same content lock and snapshot stored in catalogSource.exhibition (title/dates/city/status/revision). Cancelled/ended cannot submit exhibition-specific enquiries; all sources removable to start general enquiry. Existing provider/project compatibility remains enforced; related project must match event projectKeys.

Tasks and verification:

1. Data/backend: validators + public whitelist + publish guard + list/detail API/docs + tests for dates,status,filters,publication.
2. Public UI: translated list/detail, city/industry/month/search/archive, status/official links/related projects and JSON-LD with safe escaping, empty states.
3. Admin: separate navigation and content kind, structured fields, city/industry/date/status filtering, review/preview, existing permission restrictions.
4. Integration: source validation/idempotency snapshot, seven-language routes/nav/metadata/sitemap/public content links. Unit/integration tests for draft privacy, editor denial, unpublish and status-change enquiry rejection.
5. Seed a small set of verified official-source exhibition drafts, clearly unpublished until reviewed. Verify local build/browser and commit.
