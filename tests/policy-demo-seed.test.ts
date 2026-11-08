import test from "node:test";
import assert from "node:assert/strict";
import { demoPolicyFacts } from "../scripts/lib/policy-demo-seed.ts";
test("shared demo facts cover only fictional countries, hours, expiration and fixed cutoff", () => {
  const rows = demoPolicyFacts("2026-11-08", 3);
  assert.deepEqual(
    rows.map((r) => r.countryCode),
    ["XY", "XZ", "XW", "XQ"],
  );
  assert.equal(rows[0].validUntil, "2026-12-31");
  assert.equal(rows[1].maximumStay, 240);
  assert.equal(rows[1].stayUnit, "hours");
  assert.match(rows[1].portsAndRegions.join(" "), /第三国.*third country/i);
  assert.ok(rows[2].validUntil! < "2026-11-08");
  assert.ok(rows.every((r) => r.officialSourceUrl.startsWith("https://example.invalid/")));
});

test("old demo startup requires protected cutover; fresh or upgraded state passes", async () => {
  const { assertPolicyDemoReady } = await import("../scripts/lib/demo-environment.mjs");
  assert.throws(() => assertPolicyDemoReady({ seeded: true, seedVersion: 2 }), /受保护.*升级/);
  assert.doesNotThrow(() => assertPolicyDemoReady({ seeded: false }));
  assert.doesNotThrow(() => assertPolicyDemoReady({ seeded: true, policySeedVersion: 1 }));
});
