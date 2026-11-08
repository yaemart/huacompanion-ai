import test from "node:test";
import assert from "node:assert/strict";
import { validateSharedFacts, publicSharedFacts } from "../src/lib/policy-shared-facts.ts";
const today = "2026-11-08";
const facts = {
  countryCode: "XY",
  countryNameEn: "Fictional country",
  countryNameZh: "虚构国家",
  policyType: "unilateral",
  maximumStay: 30,
  stayUnit: "days",
  validFrom: "2026-01-01",
  validUntil: null,
  officialSourceUrl: "https://example.invalid/policy",
  portsAndRegions: ["虚构口岸"],
  lastVerifiedOn: "2026-01-01",
  verifiedBy: 1,
  internalNotes: "private",
};
test("shared facts require explicit correct units and never infer old transit days", () => {
  validateSharedFacts(facts, today, true);
  const transit = { ...facts, policyType: "transit-240h", stayUnit: "hours", maximumStay: 144 };
  validateSharedFacts(transit, today, true);
  for (const value of [
    { ...transit, stayUnit: "days" },
    { ...facts, stayUnit: "hours" },
    { ...transit, maximumStay: null },
    { ...transit, maximumStay: "240" },
    { ...transit, maximumStay: 0 },
    { ...transit, maximumStay: 1.5 },
    { ...transit, maximumStay: undefined, maxStayDays: 10 },
  ])
    assert.throws(() => validateSharedFacts(value, today, true));
});
test("shared facts enforce country, dates, verification and strict fact-only keys", () => {
  assert.throws(() => validateSharedFacts(facts, today, false));
  validateSharedFacts({ ...facts, countryCode: "DE" }, today, false);
  for (const edit of [
    { publicNotes: "explanation must be separate" },
    { unknown: "not allowed" },
    { verifiedBy: 0 },
    { lastVerifiedOn: "2026-12-01" },
    { validFrom: "2026-02-30" },
    { countryCode: "ZZ" },
    { officialSourceUrl: "http://example.invalid" },
  ])
    assert.throws(() => validateSharedFacts({ ...facts, ...edit }, today, true));
});
test("public shared facts projection excludes staff/internal data and keeps source immutable", () => {
  validateSharedFacts(facts, today, true);
  const before = structuredClone(facts);
  const result = publicSharedFacts(facts);
  assert.equal(result.maxStayDays, 30);
  assert.equal(result.publicNotes, "");
  assert.equal("verifiedBy" in result, false);
  assert.equal("internalNotes" in result, false);
  assert.equal("maximumStay" in result, false);
  result.portsAndRegions.push("modified projection");
  assert.deepEqual(facts, before);
  const transit = { ...facts, policyType: "transit-240h", stayUnit: "hours", maximumStay: 144 };
  validateSharedFacts(transit, today, true);
  assert.equal(publicSharedFacts(transit).maxStayHours, 144);
  assert.equal(publicSharedFacts(transit).maxStayDays, null);
});

test("shared fact drafts reject hidden fields and clone incomplete facts without mutation", async () => {
  const { sharedFactDraft } = await import("../src/lib/policy-shared-facts.ts");
  for (const value of [
    null,
    [],
    "text",
    { publicNotes: "language" },
    { activeFactVersion: 1 },
    { maximumStay: 30, unknown: true },
  ])
    assert.throws(() => sharedFactDraft(value));
  const value = { countryCode: "XY", maximumStay: null, portsAndRegions: ["fictional"] };
  const result = sharedFactDraft(value);
  assert.deepEqual(result, value);
  (result.portsAndRegions as string[]).push("new");
  assert.deepEqual(value.portsAndRegions, ["fictional"]);
});

test("incomplete shared drafts reject malformed field types before editor hydration", async () => {
  const { sharedFactDraft } = await import("../src/lib/policy-shared-facts.ts");
  for (const value of [
    { maximumStay: "240" },
    { maximumStay: {} },
    { verifiedBy: {} },
    { portsAndRegions: [null] },
    { portsAndRegions: {} },
    { countryNameZh: {} },
    { stayUnit: "minutes" },
  ])
    assert.throws(() => sharedFactDraft(value));
  assert.deepEqual(sharedFactDraft({ maximumStay: null, stayUnit: null, portsAndRegions: [] }), {
    maximumStay: null,
    stayUnit: null,
    portsAndRegions: [],
  });
});

test("shared fact drafts reject prototype names and unknown policy types", async () => {
  const { sharedFactDraft } = await import("../src/lib/policy-shared-facts.ts");
  for (const policyType of ["__proto__", "constructor", "toString", "unknown-policy"])
    assert.throws(() => sharedFactDraft({ countryCode: "DE", policyType }), /政策类型/);
  for (const policyType of [null, "unilateral", "bilateral", "transit-240h", "other"])
    assert.equal(sharedFactDraft({ policyType }).policyType, policyType);
});
