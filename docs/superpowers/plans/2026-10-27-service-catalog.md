# Service Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish provider profiles and Hua service projects with structured public reads and linked Hua inquiries.
**Architecture:** Extend existing content drafts/snapshots with provider-profile and service-project kinds and typed catalog data. Keep private provider binding in separate restricted fields; public projections never contain it. Reuse existing inquiry workflow.
**Tech Stack:** Next.js, Payload, PostgreSQL, TypeScript.
**Spec:** docs/superpowers/specs/2026-10-27-service-catalog-design.md

## Global Constraints
- Local only; zh/en independent publication; no real providers or invented verification.
- All inquiries go through Hua; no payment, live availability or direct Agent writes.
- Private records never become public through relation expansion.
- Draft edits cannot alter snapshots; invalid provider permission blocks all public surfaces.
- Keep existing service routes and general inquiries working.

## Review Focus
- Suspended then restored provider must not silently reactivate a required project: persist suspension until project republish.
- Stale inquiry selections must return an actionable error, never silently discard.
- Media eligibility must use the same publication gates as API and pages.
- Public JSON-LD and pagination must agree with visible records.
- Two selections must belong together; request hash includes source identifiers.

### Task 1: Catalog model and publication
Files: src/lib/catalog.ts, tests/catalog.test.ts, src/lib/content-model.ts, src/cms/content/collections.ts, src/server/content/service.ts, src/server/catalog.ts, src/cms/collections.ts.
Interfaces: validateCatalog(body, publishing), publicCatalog(catalog), listPublished(p,locale), resolveCatalogSource(p,locale,source).
- [x] Add failing tests for fee validation, required provider selection, safe projection and source parsing.
- [x] Implement typed catalog fields, whitelist and separate private providerRef snapshot binding; publishing guards and live eligibility.
- [x] Add regression tests for provider revocation and persistent project suspension.
- [x] Generate Payload types/migration; verify unit and content integration tests.

### Task 2: Editorial and public UI
Files: src/components/content/CatalogFields.tsx, ContentCenter.tsx, src/components/catalog/CatalogPage.tsx, frontend locale page.tsx, Header.tsx, public catalog route, sitemap route and API documentation route.
Interfaces: CatalogFields(value,onChange), CatalogPage(items,locale,kind,slug,filters).
- [x] Add kind/city filters and two explicit workbench entries, labeled structured catalog inputs and private provider binding for admins.
- [x] Implement directory/detail routes, URL filters, pagination, prices, eligibility and Hua inquiry CTAs.
- [x] Add public catalog endpoint, discovery/field documentation, safe JSON-LD and sitemap.
- [x] Run build and inspect desktop/mobile directory views.

### Task 3: Linked inquiries
Files: src/lib/intake-validation.ts, src/server/intake.ts, InquiryForm.tsx, Site.tsx, src/cms/collections.ts.
Interfaces: parsed.source={provider?,project?}; server-owned source snapshot stored on inquiry.
- [x] Add failing source-ID validation and hash/eligibility integration tests.
- [x] Prefill resolved source display, explicit clear-selection link and preserve invalid source error.
- [x] Revalidate within inquiry transaction; preserve duplicate retries; store source titles/version plus internal restricted association.
- [x] Verify existing general request and linked requests, revocation and incompatible selections.

### Task 4: Verification and handoff
- [x] Run unit, content, catalog integration, HTTP and migration/backup checks.
- [x] Fresh independent review; address important findings with regression tests.
- [x] Record actual results/limitations and commit locally; keep preview running.
