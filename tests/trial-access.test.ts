import assert from "node:assert/strict";
import test from "node:test";
import { trialAccess } from "../src/lib/trial-access.ts";
const env = {
  APP_ENV: "trial",
  TRIAL_ACCESS_REQUIRED: "true",
  TRIAL_ACCESS_USER: "trial",
  TRIAL_ACCESS_PASSWORD: "a".repeat(40),
};
const auth = (password = env.TRIAL_ACCESS_PASSWORD) =>
  `Basic ${Buffer.from(`trial:${password}`).toString("base64")}`;
test("trial access requires strong configured credentials and constant authenticated boundary", () => {
  assert.equal(trialAccess(null, env), "unauthorized");
  assert.equal(trialAccess(auth(), env), "allowed");
  for (const header of [auth("bad"), "Bearer secret", "Basic !!!", "Basic " + "a".repeat(3000)])
    assert.equal(trialAccess(header, env), "unauthorized");
  for (const password of [undefined, "", "short"])
    assert.equal(trialAccess(auth(), { ...env, TRIAL_ACCESS_PASSWORD: password }), "unavailable");
});
test("Render trial cannot disable access; local preview unchanged; maintenance blocks valid credentials", () => {
  assert.equal(trialAccess(null, {}), "disabled");
  assert.equal(trialAccess(null, { APP_ENV: "local" }), "disabled");
  assert.equal(
    trialAccess(null, { APP_ENV: "trial", RENDER: "true", TRIAL_ACCESS_REQUIRED: "false" }),
    "unavailable",
  );
  assert.equal(trialAccess(auth(), { ...env, TRIAL_MAINTENANCE: "true" }), "maintenance");
  assert.equal(trialAccess(auth(), { ...env, TRIAL_ACCESS_REQUIRED: "typo" }), "unavailable");
});
