import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { policySeedEnvironment } from "../src/lib/immigration-policy-seed-env.ts";

const target = "postgresql://fixture:fixture@127.0.0.1:55438/hua_companion";
test("seed guard accepts only the dedicated local database without driver overrides", () => {
  assert.equal(policySeedEnvironment({ APP_ENV: "local", DATABASE_URL: target }), true);
  for (const DATABASE_URL of [
    target + "?host=example.invalid&port=5432",
    target + "?database=another_database",
    target + "#fragment",
    target.replace("postgresql:", "http:"),
    target.replace("127.0.0.1", "example.invalid"),
    target.replace("55438", "55439"),
    target.replace("hua_companion", "other_database"),
    "postgresql://fixture:DoNotLogDatabaseSecret@127.0.0.1:invalid/hua_companion",
  ])
    assert.equal(policySeedEnvironment({ APP_ENV: "local", DATABASE_URL }), false);
  for (const APP_ENV of [undefined, "ci", "trial", "production"])
    assert.equal(policySeedEnvironment({ APP_ENV, DATABASE_URL: target }), false);
});

test("real seed CLI rejects malformed database configuration without printing its secret", async () => {
  await assert.rejects(
    () =>
      promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/seed-policies.ts",
          "--file",
          "scripts/content/policy-seeds.example.json",
        ],
        {
          env: {
            ...process.env,
            APP_ENV: "local",
            PAYLOAD_SECRET: "unit-only-payload-secret-not-a-real-credential",
            DATABASE_URL:
              "postgresql://fixture:DoNotLogDatabaseSecret@127.0.0.1:invalid/hua_companion",
          },
        },
      ),
    (error: unknown) => {
      const failure = error as { code: number; stderr: string };
      assert.equal(failure.code, 1);
      assert.ok(!failure.stderr.includes("DoNotLogDatabaseSecret"));
      return true;
    },
  );
});
