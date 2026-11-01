import test from "node:test";
import assert from "node:assert/strict";
import { parsePolicySeeds } from "../src/lib/immigration-policy-seed.ts";
import { validatePolicyPublication } from "../src/lib/immigration-policy.ts";

const seed = {
  contentKey: "unverified-fixture",
  locale: "en",
  title: "Unverified fictional template",
  policy: { countryCode: null, portsAndRegions: ["Unverified condition"] },
};

test("policy seeds remain partial drafts and copy caller-owned fields", () => {
  const input = structuredClone(seed);
  const [parsed] = parsePolicySeeds([input]);
  assert.equal(parsed.body.kind, "immigration-policy");
  assert.deepEqual(parsed.body.blocks, []);
  assert.equal(parsed.policy.countryCode, null);
  assert.throws(() => validatePolicyPublication(parsed.policy, "2026-11-01"));
  (parsed.policy.portsAndRegions as string[]).push("Changed copy");
  assert.deepEqual(input.policy.portsAndRegions, ["Unverified condition"]);
});

test("seed input rejects ambiguous identities, unsupported languages and workflow fields", () => {
  for (const value of [
    null,
    {},
    [null],
    [seed, seed],
    [{ ...seed, locale: "fr" }],
    [{ ...seed, contentKey: "Invalid Key" }],
    [{ ...seed, contentKey: undefined }],
    [{ ...seed, contentKey: null }],
    [{ ...seed, contentKey: 123 }],
    [seed, { ...seed, locale: "zh", contentKey: null }],
    [{ ...seed, title: " " }],
    [{ ...seed, id: 42 }],
    [{ ...seed, action: "publish" }],
    [{ ...seed, policy: { status: "published" } }],
  ])
    assert.throws(() => parsePolicySeeds(value));
  assert.equal(parsePolicySeeds([seed, { ...seed, locale: "zh" }]).length, 2);
});

test("import cannot impersonate verification or accept malformed policy fields", () => {
  for (const policy of [
    { verifiedBy: 1 },
    { lastVerifiedOn: "2026-11-01" },
    { maxStayDays: -1 },
    { policyType: "invented" },
    { portsAndRegions: [null] },
    { unexpected: "private" },
  ])
    assert.throws(() => parsePolicySeeds([{ ...seed, policy }]));
});
