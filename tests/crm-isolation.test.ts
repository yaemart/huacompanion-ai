import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
test("CRM target guard rejects demo and remote database targets before initialization", async () => {
  assert.ok(existsSync("scripts/lib/crm-test-target.mjs"));
  const { assertCrmTarget } = await import("../scripts/lib/crm-test-target.mjs");
  const valid = "postgresql://crm_owner:fictional@127.0.0.1:55443/hua_crm_test_" + "a".repeat(32);
  assert.doesNotThrow(() => assertCrmTarget(valid, {}));
  for (const bad of [
    valid.replace("55443", "55442"),
    valid.replace("127.0.0.1", "localhost"),
    valid.replace("hua_crm_test_", "hua_"),
    valid + "?options=bad",
    valid + "#bad",
    valid.replace("crm_owner", "hua"),
  ])
    assert.throws(() => assertCrmTarget(bad, {}));
  for (const env of [{ PAYLOAD_DROP_DATABASE: "true" }, { PGOPTIONS: "bad" }, { PGHOST: "remote" }])
    assert.throws(() => assertCrmTarget(valid, env));
});
