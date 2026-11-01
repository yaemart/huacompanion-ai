import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePolicyPublication,
  publicPolicy,
  validatePublicPolicy,
  type PolicyPublicationData,
} from "../src/lib/immigration-policy.ts";

const policy: PolicyPublicationData = {
  countryCode: "FR",
  countryNameEn: "Fixture country",
  countryNameZh: "测试国家",
  policyType: "unilateral",
  maxStayDays: 30,
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  portsAndRegions: [],
  officialSourceUrl: "https://example.invalid/official-fixture",
  lastVerifiedOn: "2026-11-01",
  verifiedBy: 7,
  publicNotes: "Fictional policy for tests; not travel advice.",
  internalNotes: "Private review note",
};

test("publication accepts complete policies and an explicitly absent expiry", () => {
  validatePolicyPublication(policy, "2026-11-01");
  validatePolicyPublication({ ...policy, validUntil: null }, "2026-11-01");
  validatePolicyPublication({ ...policy, validUntil: undefined }, "2026-11-01");
  validatePolicyPublication({ ...policy, internalNotes: null }, "2026-11-01");
});

test("public snapshot validation needs no private verification fields", () => {
  const facts = publicPolicy(policy);
  validatePublicPolicy(facts, "2026-11-01");
  validatePublicPolicy({ ...facts, validUntil: null }, "2026-11-01");
  assert.throws(() => validatePolicyPublication(facts, "2026-11-01"));
});

test("public snapshots reject invalid facts and future verification", () => {
  const facts = publicPolicy(policy);
  for (const fields of [
    { countryCode: "FRA" },
    { validFrom: "2026-02-29" },
    { validUntil: "2025-01-01" },
    { lastVerifiedOn: "2026-11-02" },
    { officialSourceUrl: "https://user:secret@example.invalid" },
    { portsAndRegions: [7] },
  ])
    assert.throws(() => validatePublicPolicy({ ...facts, ...fields }, "2026-11-01"));
});

test("publication rejects malformed or incomplete policy facts", () => {
  for (const fields of [
    { countryCode: "fra" },
    { countryCode: "F" },
    { countryNameEn: " " },
    { countryNameZh: null },
    { policyType: "invented" },
    { maxStayDays: 0 },
    { maxStayDays: 1.5 },
    { maxStayDays: "30" },
    { verifiedBy: null },
    { verifiedBy: -1 },
    { officialSourceUrl: "javascript:alert(1)" },
    { officialSourceUrl: "https://user:secret@example.invalid" },
    { portsAndRegions: [7] },
    { publicNotes: { unsafe: true } },
    { internalNotes: { unsafe: true } },
  ])
    assert.throws(() => validatePolicyPublication({ ...policy, ...fields }, "2026-11-01"));
  for (const value of [null, [], "policy", 2])
    assert.throws(() => validatePolicyPublication(value, "2026-11-01"));
});

test("publication validates calendar dates, ranges, and verification without timezone drift", () => {
  for (const fields of [
    { validFrom: "2026-02-29" },
    { validFrom: "2026-1-01" },
    { validUntil: "2025-12-31" },
    { validUntil: "2026-12-31T00:00:00Z" },
    { lastVerifiedOn: "2026-11-02" },
    { lastVerifiedOn: "2026-04-31" },
  ])
    assert.throws(() => validatePolicyPublication({ ...policy, ...fields }, "2026-11-01"));
  validatePolicyPublication({ ...policy, validFrom: "2024-02-29" }, "2026-11-01");
  validatePolicyPublication({ ...policy, validUntil: "2026-01-01" }, "2026-11-01");
  assert.throws(() => validatePolicyPublication(policy, "invalid-today"));
});

test("240-hour transit requires reviewed port or region conditions", () => {
  assert.throws(() =>
    validatePolicyPublication({ ...policy, policyType: "transit-240h" }, "2026-11-01"),
  );
  validatePolicyPublication(
    { ...policy, policyType: "transit-240h", portsAndRegions: ["Fixture port conditions"] },
    "2026-11-01",
  );
});

test("public policy projection excludes staff, private notes, and unexpected fields", () => {
  const input = { ...policy, portsAndRegions: ["Fixture port"], email: "private@example.invalid" };
  const result = publicPolicy(input);
  assert.deepEqual(result, {
    countryCode: "FR",
    countryNameEn: "Fixture country",
    countryNameZh: "测试国家",
    policyType: "unilateral",
    maxStayDays: 30,
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    portsAndRegions: ["Fixture port"],
    officialSourceUrl: "https://example.invalid/official-fixture",
    lastVerifiedOn: "2026-11-01",
    publicNotes: "Fictional policy for tests; not travel advice.",
  });
  result.portsAndRegions.push("Changed copy");
  assert.deepEqual(input.portsAndRegions, ["Fixture port"]);
});
