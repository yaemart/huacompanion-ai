import test from "node:test";
import assert from "node:assert/strict";
import {
  changePolicyType,
  changePolicyHours,
  policyStay,
} from "../src/lib/immigration-policy-stay.ts";
import { policyForm } from "../src/lib/immigration-policy-editor.ts";
import { validatePublicPolicy, publicPolicy } from "../src/lib/immigration-policy.ts";
import { policyDraft } from "../src/lib/immigration-policy-draft.ts";
import { queryImmigrationPolicies } from "../src/lib/immigration-policy-query.ts";
import { queryPolicy, queryContext } from "./helpers/policy-query-fixture.ts";

test("type defaults use days/hours and clear stale duration without erasing custom ports", () => {
  const blank = policyForm();
  const unilateral = changePolicyType(blank, "unilateral");
  assert.equal(unilateral.maxStayDays, 30);
  assert.equal(unilateral.maxStayHours, null);
  assert.deepEqual(unilateral.portsAndRegions, ["所有对外国人开放的口岸"]);
  assert.equal(changePolicyType(unilateral, "unilateral"), unilateral);
  const transit = changePolicyType(unilateral, "transit-240h");
  assert.equal(transit.maxStayDays, null);
  assert.equal(transit.maxStayHours, 240);
  assert.deepEqual(transit.portsAndRegions, []);
  const bilateral = changePolicyType(
    { ...transit, portsAndRegions: ["人工核实口岸"] },
    "bilateral",
  );
  assert.equal(bilateral.maxStayDays, null);
  assert.equal(bilateral.maxStayHours, null);
  assert.deepEqual(bilateral.portsAndRegions, ["人工核实口岸"]);
  assert.equal(blank.policyType, null);
});

test("legacy transit keeps its original days and resolves 240 hours, explicit hours win", () => {
  const old = queryPolicy({ policyType: "transit-240h", maxStayDays: 3 });
  assert.deepEqual(policyStay(old), { unit: "hours", maximum: 240 });
  assert.equal(old.maxStayDays, 3);
  assert.equal("maxStayHours" in publicPolicy(old), false);
  const explicit = { ...old, maxStayDays: null, maxStayHours: 144 };
  validatePublicPolicy(explicit, queryContext.verifiedOnOrBefore);
  assert.deepEqual(policyStay(explicit), { unit: "hours", maximum: 144 });
  const result = queryImmigrationPolicies(
    { nationalityISO: "XY", arrivalDate: "2026-01-01" },
    [explicit],
    queryContext,
  );
  assert.deepEqual(result.matches[0]?.stay, { unit: "hours", maximum: 144 });
  assert.equal("maxStayHours" in result.matches[0], false);
});

test("hour facts reject invalid values and non-transit hours; bilateral needs verified days", () => {
  const base = { ...queryPolicy({ policyType: "transit-240h" }), maxStayDays: null };
  for (const maxStayHours of [0, -1, 1.5, "240", null, undefined])
    assert.throws(() =>
      validatePublicPolicy({ ...base, maxStayHours }, queryContext.verifiedOnOrBefore),
    );
  for (const maxStayHours of [0, -1, 1.5, "240"])
    assert.throws(() => policyDraft({ maxStayHours }));
  assert.deepEqual(policyDraft({ maxStayHours: 144 }), { maxStayHours: 144 });
  assert.throws(() =>
    validatePublicPolicy({ ...queryPolicy(), maxStayHours: 240 }, queryContext.verifiedOnOrBefore),
  );
  assert.throws(() =>
    validatePublicPolicy(
      { ...queryPolicy({ policyType: "bilateral" }), maxStayDays: null },
      queryContext.verifiedOnOrBefore,
    ),
  );
});

test("empty and whitespace port lines do not suppress unilateral default", () => {
  for (const portsAndRegions of [
    [""],
    ["  "],
    ["所有对外国人开放的口岸", ""],
    [" 所有对外国人开放的口岸 ", " "],
  ]) {
    assert.deepEqual(
      changePolicyType({ ...policyForm(), portsAndRegions }, "unilateral").portsAndRegions,
      ["所有对外国人开放的口岸"],
    );
  }
});

test("explicit hour editing clears the legacy fallback without mutating the old draft", () => {
  const legacy = {
    ...policyForm(),
    policyType: "transit-240h" as const,
    maxStayDays: 3,
    maxStayHours: null,
  };
  const cleared = changePolicyHours(legacy, null);
  assert.equal(cleared.maxStayHours, null);
  assert.equal(cleared.maxStayDays, null);
  assert.equal(legacy.maxStayDays, 3);
  assert.equal(changePolicyHours(legacy, 144).maxStayHours, 144);
});
