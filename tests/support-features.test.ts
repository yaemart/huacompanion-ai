import test from "node:test";
import assert from "node:assert/strict";
import { featureState } from "../src/lib/support-features.ts";
test("feature availability requires implementation, configuration and switch", () => {
  assert.equal(featureState("voiceMessages", { voiceMessages: true }, {}).available, false);
  assert.equal(featureState("textChat", {}, {}).available, false);
  assert.equal(featureState("textChat", { textChat: true }, {}).available, true);
  assert.equal(featureState("aiReception", { aiReception: true }, {}).available, false);
  assert.equal(
    featureState("aiReception", { aiReception: false }, { aiReception: true }).available,
    false,
  );
  assert.equal(
    featureState("aiReception", { aiReception: true }, { aiReception: true }).available,
    true,
  );
});
