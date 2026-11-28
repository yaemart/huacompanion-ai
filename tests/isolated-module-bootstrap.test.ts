import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("module bootstrap refuses an unmarked environment before loading application config", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "tests/helpers/isolated-module-bootstrap.ts"],
    {
      env: { PATH: process.env.PATH, DOTENV_CONFIG_PATH: "/dev/null", NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Isolated module bootstrap only/);
});

test("module bootstrap rejects a demo-shaped database before loading application config", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "tests/helpers/isolated-module-bootstrap.ts"],
    {
      env: {
        PATH: process.env.PATH,
        DOTENV_CONFIG_PATH: "/dev/null",
        NODE_ENV: "test",
        HUA_CRM_ISOLATED: "true",
        DATABASE_URL: "postgresql://fake:fake@127.0.0.1:55442/fictional_demo",
      },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CRM requires its dedicated loopback cluster/);
});
