import { test } from "node:test";
import assert from "node:assert/strict";
import { policyForm, policyFormInput } from "../src/lib/immigration-policy-editor.ts";
import type { ImmigrationPolicy } from "../payload-types.ts";
test("blank policy form preserves unknown facts and normalizes conditions only when saving", () => {
  const value = policyForm();
  assert.equal(value.maxStayDays, null);
  assert.equal(value.verifiedBy, null);
  assert.deepEqual(value.portsAndRegions, []);
  assert.equal(value.validUntil, null);
  value.portsAndRegions = [" A ", "", "B\n", " "];
  assert.deepEqual(policyFormInput(value).portsAndRegions, ["A", "B"]);
  assert.deepEqual(value.portsAndRegions, [" A ", "", "B\n", " "]);
});
test("policy form allowlist excludes master metadata and expanded verifier objects", () => {
  const record = {
    id: 8,
    policyKey: "fictional:en",
    status: "draft",
    revision: 3,
    countryCode: "XY",
    verifiedBy: { id: 7, email: "private@example.invalid" },
    portsAndRegions: [{ id: "row", label: "A" }],
  } as ImmigrationPolicy;
  const form = policyForm(record);
  assert.equal(form.verifiedBy, 7);
  assert.deepEqual(form.portsAndRegions, ["A"]);
  for (const hidden of ["policyKey", "status", "revision", "email", "id"])
    assert.ok(!Object.hasOwn(form, hidden));
  assert.ok(!JSON.stringify(form).includes("private@example.invalid"));
});
