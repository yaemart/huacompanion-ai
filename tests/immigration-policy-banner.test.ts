import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePolicyBanner,
  parsePolicyBannerBlock,
} from "../src/lib/immigration-policy-banner.ts";
import {
  validateContent,
  validateCandidate,
  publicBody,
  type ContentBody,
} from "../src/lib/content-model.ts";
import { queryPolicy } from "./helpers/policy-query-fixture.ts";
const day = "2026-11-02";

test("banner counts inclusive0/30day cutoff and never treats the following day as valid", () => {
  for (const validUntil of ["2026-11-02", "2026-12-02"])
    assert.equal(derivePolicyBanner(queryPolicy({ validUntil }), null, day)?.status, "expiring");
  assert.equal(derivePolicyBanner(queryPolicy({ validUntil: "2026-12-03" }), null, day), null);
  assert.equal(
    derivePolicyBanner(queryPolicy({ validUntil: "2026-11-01" }), null, day)?.status,
    "unconfirmed",
  );
  assert.equal(
    derivePolicyBanner(queryPolicy({ validFrom: "2026-12-03" }), null, day)?.status,
    "unconfirmed",
  );
  assert.equal(
    derivePolicyBanner(queryPolicy({ validUntil: null }), null, day)?.status,
    "unconfirmed",
  );
  assert.throws(() => derivePolicyBanner(queryPolicy(), null, "2026-02-30"));
  assert.equal(
    derivePolicyBanner(queryPolicy({ validUntil: "2028-02-29" }), null, "2028-02-29")?.status,
    "expiring",
  );
});

test("extension requires comparable two approved finite cutoff records, verified chronology and safe sources", () => {
  const current = queryPolicy({ validUntil: "2026-12-31", lastVerifiedOn: day });
  const previous = queryPolicy({ validUntil: "2026-12-02" });
  const result = derivePolicyBanner(current, previous, day);
  assert.equal(result?.status, "extended");
  assert.equal(result?.previous?.validUntil, "2026-12-02");
  for (const patch of [
    { countryCode: "ZZ" },
    { policyType: "other" as const },
    { validFrom: "2026-01-02" },
    { validUntil: null },
    { validUntil: "2027-01-01" },
    { lastVerifiedOn: "2026-11-03" },
    { officialSourceUrl: "http://example.invalid" },
  ])
    assert.equal(derivePolicyBanner(current, { ...previous, ...patch }, day), null);
  assert.equal(
    derivePolicyBanner(
      { ...current, lastVerifiedOn: "2026-01-01" },
      { ...previous, lastVerifiedOn: day },
      day,
    ),
    null,
  );
  assert.equal(
    derivePolicyBanner(
      { ...current, validUntil: "2026-12-02" },
      { ...previous, validUntil: "2026-11-01" },
      day,
    )?.status,
    "expiring",
  );
});

test("manual unknown wins, invalid/private inputs fail closed, detached public output cannot leak drafts", () => {
  const current = queryPolicy();
  Object.freeze(current.portsAndRegions);
  Object.freeze(current);
  const result = derivePolicyBanner(current, null, day, true);
  assert.equal(result?.status, "unconfirmed");
  result?.policy?.portsAndRegions.push("Changed");
  assert.equal(current.portsAndRegions.length, 1);
  for (const raw of [
    null,
    {},
    "bad",
    { ...current, verifiedBy: 1 },
    { ...current, internalNotes: "Secret" },
    { ...current, lastVerifiedOn: "2026-11-03" },
  ]) {
    const state = derivePolicyBanner(raw, null, day);
    assert.deepEqual(state, { status: "unconfirmed", policy: null, previous: null });
  }
});

test("banner reference validates exact key and boolean, survives public content projection, and AI cannot add it", () => {
  const block = { type: "policy-banner" as const, text: "policy-a", policyUnconfirmed: true };
  assert.deepEqual(parsePolicyBannerBlock(block), { key: "policy-a", unconfirmed: true });
  for (const value of [
    null,
    { ...block, text: "../secret" },
    { ...block, text: " policy-a " },
    { ...block, text: 123 },
    { ...block, policyUnconfirmed: "true" },
  ])
    assert.equal(parsePolicyBannerBlock(value), null);
  const content: ContentBody = {
    kind: "guide",
    locale: "en",
    contentKey: "guide-a",
    slug: "guide-a",
    title: "Guide",
    blocks: [block],
    sources: [],
  };
  assert.doesNotThrow(() => validateContent(content));
  assert.deepEqual(publicBody(content).blocks, [{ ...block, url: undefined, mediaId: undefined }]);
  assert.throws(() => validateContent({ ...content, blocks: [{ ...block, text: "bad key" }] }));
  assert.throws(() =>
    validateCandidate({ title: "Candidate", blocks: [block], sourceIds: [], questions: [] }, []),
  );
});
