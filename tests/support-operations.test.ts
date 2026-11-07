import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("support operations preserve scope and require explicit retention confirmation", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "tests/integration/support-operations.ts"],
    {
      encoding: "utf8",
      timeout: 30000,
      // This fixture imports Payload config but uses only an in-memory database.
      env: {
        ...process.env,
        APP_ENV: "ci",
        PAYLOAD_SECRET: "unit-only-support-operations-secret-not-a-real-credential",
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused_unit_tests",
        WORKFLOW_MAIL_ENABLED: "false",
        BUSINESS_AI_ENABLED: "false",
        SUPPORT_CALL_AI_ENABLED: "false",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS support operations/);
});
