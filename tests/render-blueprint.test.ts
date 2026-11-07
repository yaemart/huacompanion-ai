import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("Render template keeps one media owner, one migrator, idle workers, private DB and manual deploys", () => {
  const b = JSON.parse(readFileSync("deploy/render/blueprint.json", "utf8"));
  assert.equal(b.services.length, 3);
  assert.equal(b.services.filter((s: { disk?: object }) => s.disk).length, 1);
  assert.equal(
    b.services.filter((s: { preDeployCommand?: string }) => s.preDeployCommand).length,
    1,
  );
  const web = b.services.find((s: { type: string }) => s.type === "web");
  assert.equal(web.healthCheckPath, "/api/health");
  assert.equal(web.disk.mountPath, "/app/.local/content-media");
  for (const s of b.services) {
    assert.equal(s.autoDeployTrigger, "off");
    assert.match(s.dockerCommand, /^node scripts\/render-runtime\.mjs (web|support|workflow)$/);
    if (s.type === "worker")
      assert.ok(
        s.envVars.some(
          (v: { key: string; value: string }) =>
            v.key === "TRIAL_WORKERS_ENABLED" && v.value === "false",
        ),
      );
  }
  assert.deepEqual(b.databases[0].ipAllowList, []);
  assert.equal(b.databases[0].postgresMajorVersion, "15");
  const flags = Object.fromEntries(
    b.envVarGroups[0].envVars.map((v: { key: string; value: string }) => [v.key, v.value]),
  );
  for (const key of [
    "SEARCH_ENGINE_INDEXING",
    "VISA_CHECKER_ENABLED",
    "INTAKE_ENABLED",
    "WORKFLOW_MAIL_ENABLED",
    "BUSINESS_AI_ENABLED",
  ])
    assert.equal(flags[key], "false");
  assert.equal(flags.TRIAL_ACCESS_REQUIRED, "true");
});
