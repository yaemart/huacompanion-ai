import assert from "node:assert/strict";
import test from "node:test";
import { buildPolicyTable } from "../src/lib/immigration-policy-table.ts";
import { queryPolicy } from "./helpers/policy-query-fixture.ts";

test("complete table keeps expired, current and future records with inclusive date labels", () => {
  const rows = buildPolicyTable(
    [
      queryPolicy({ validUntil: "2026-10-31" }),
      queryPolicy({ validUntil: "2026-11-01" }),
      queryPolicy({ validFrom: "2026-11-01" }),
      queryPolicy({ validFrom: "2026-11-02" }),
    ],
    "2026-11-01",
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.dateStatus).sort(), [
    "unconfirmed",
    "upcoming",
    "within-dates",
    "within-dates",
  ]);
  assert.equal(
    rows.find((row) => row.policy.validUntil === "2026-10-31")?.dateStatus,
    "unconfirmed",
  );
});

test("countries are grouped by ISO and policies use the same general-before-transit order as query", () => {
  const rows = buildPolicyTable(
    [
      queryPolicy({ countryCode: "ZZ" }),
      queryPolicy({ countryCode: "AA", policyType: "transit-240h" }),
      queryPolicy({ countryCode: "AA", policyType: "bilateral" }),
      queryPolicy({ countryCode: "AA" }),
    ],
    "2026-11-01",
  );
  assert.deepEqual(
    rows.map((row) => [row.policy.countryCode, row.policy.policyType]),
    [
      ["AA", "unilateral"],
      ["AA", "bilateral"],
      ["AA", "transit-240h"],
      ["ZZ", "unilateral"],
    ],
  );
});

test("table durations, sources and warnings reuse query semantics including open expiry and hours", () => {
  const row = buildPolicyTable(
    [queryPolicy({ policyType: "transit-240h", validUntil: null })],
    "2026-11-01",
  )[0];
  assert.deepEqual(row.policy.stay, { unit: "hours", maximum: 240 });
  assert.equal(row.policy.officialSourceUrl, "https://example.invalid/policy");
  assert.equal(row.policy.lastVerifiedOn, "2026-01-01");
  assert.deepEqual(row.policy.warnings, [
    "conditions-unchecked",
    "expiry-not-stated",
    "transit-itinerary-unchecked",
  ]);
  assert.equal("maxStayDays" in row.policy, false);
});

test("table rejects private/malformed/future-verified records without falling back to them", () => {
  const rows = buildPolicyTable(
    [
      null,
      "bad",
      { ...queryPolicy(), internalNotes: "private fixture" },
      queryPolicy({ lastVerifiedOn: "2027-01-01" }),
      queryPolicy({ officialSourceUrl: "javascript:alert(1)" }),
      queryPolicy(),
    ],
    "2026-11-01",
  );
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /private fixture|internalNotes|verifiedBy/);
  assert.throws(() => buildPolicyTable([], "invalid"), /核实日期基准无效/);
});

test("table has no 200-row truncation and does not mutate frozen input", () => {
  const policy = queryPolicy();
  Object.freeze(policy.portsAndRegions);
  Object.freeze(policy);
  const policies = Object.freeze(Array.from({ length: 201 }, () => policy));
  const rows = buildPolicyTable(policies, "2026-11-01");
  assert.equal(rows.length, 201);
  rows[0].policy.portsAndRegions.push("Caller change");
  assert.deepEqual(policy.portsAndRegions, ["Fictional port condition"]);
});
