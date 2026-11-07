import test from "node:test";
import assert from "node:assert/strict";
import { visaCheckerEnabled } from "../src/lib/immigration-policy-flags.ts";

test("visa checker is unavailable unless explicitly enabled", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", " true "])
    assert.equal(visaCheckerEnabled({ VISA_CHECKER_ENABLED: value }), false);
  assert.equal(visaCheckerEnabled({ VISA_CHECKER_ENABLED: "true" }), true);
});
