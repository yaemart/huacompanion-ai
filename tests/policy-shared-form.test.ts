import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedPolicyForm, sharedPolicyInput } from "../src/lib/policy-shared-form.ts";
test("shared facts explicitly round-trip hours and days without language fields", () => {
  const facts = {
    countryCode: "XZ",
    policyType: "transit-240h",
    maximumStay: 240,
    stayUnit: "hours",
    verifiedBy: 1,
    portsAndRegions: ["  第三国机票  "],
    internalNotes: "private",
  };
  const form = sharedPolicyForm(facts);
  assert.equal(form.maxStayHours, 240);
  assert.equal(form.maxStayDays, null);
  assert.deepEqual(sharedPolicyInput(form).portsAndRegions, ["第三国机票"]);
  assert.equal(sharedPolicyInput(form).internalNotes, "private");
  assert.equal(sharedPolicyInput(form).maximumStay, 240);
  const days = sharedPolicyForm({
    ...facts,
    policyType: "bilateral",
    stayUnit: "days",
    maximumStay: 15,
  });
  assert.equal(days.maxStayDays, 15);
  assert.equal(days.maxStayHours, null);
  const input = sharedPolicyInput({ ...days, publicNotes: "never shared" });
  assert.equal(input.maximumStay, 15);
  assert.equal(input.stayUnit, "days");
  assert.ok(!("publicNotes" in input));
  assert.ok(!("maxStayDays" in input));
});
test("missing hour values stay incomplete and blank forms retain verifier defaults", () => {
  const form = sharedPolicyForm({
    policyType: "transit-240h",
    maximumStay: null,
    stayUnit: "hours",
  });
  assert.equal(form.maxStayHours, null);
  assert.equal(form.maxStayDays, null);
  assert.equal(sharedPolicyInput(form).maximumStay, null);
  assert.deepEqual(sharedPolicyForm().portsAndRegions, []);
});
