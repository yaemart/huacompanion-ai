import { test } from "node:test";
import assert from "node:assert/strict";
import { switchLocale, isKnownRoute } from "../src/lib/routes.ts";
test("language switch retains a deep service path", () => {
  assert.equal(
    switchLocale("/en/services/medical", "zh"),
    "/zh/services/medical",
  );
  assert.equal(switchLocale("/zh", "en"), "/en");
});
test("routes include service details and reject invented pages", () => {
  assert.equal(isKnownRoute(["services", "medical"]), true);
  assert.equal(isKnownRoute(["services", "fake"]), false);
  assert.equal(isKnownRoute(["request"]), true);
  assert.equal(isKnownRoute(["request", "extra"]), false);
});
